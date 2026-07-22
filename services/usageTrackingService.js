/**
 * usageTrackingService.js
 *
 * Central service for recording per-key API usage. Called by geminiService.js
 * after every successful response and every 429 rotation.
 *
 * Design decisions:
 * - All DB writes are fire-and-forget (non-blocking). A failed write never
 *   breaks a user-facing request.
 * - Daily records use findOneAndUpdate with upsert: true so concurrent
 *   requests for the same key+day are safe (atomic $inc).
 * - "Today" is always UTC midnight so stats are consistent across timezones.
 */

const { ApiKeyDaily, ApiKeyState } = require("../models/ApiKeyUsage");

const DAILY_REQUEST_LIMIT = parseInt(process.env.GEMINI_DAILY_REQUEST_LIMIT || "1500", 10);
const DAILY_TOKEN_BUDGET  = parseInt(process.env.GEMINI_DAILY_TOKEN_BUDGET  || "1000000", 10);

/**
 * Count how many GEMINI_KEY_N vars are actually set in the environment.
 * This lets usageTrackingService.js work correctly regardless of whether
 * geminiService.js has loaded yet (which sets GEMINI_KEYS_COUNT at runtime).
 * Falls back to GEMINI_KEYS_COUNT env var, then counts GEMINI_KEY_1…N directly.
 */
function resolveKeyCount() {
  // Explicit override always wins (set in .env or by geminiService at startup)
  if (process.env.GEMINI_KEYS_COUNT) {
    return parseInt(process.env.GEMINI_KEYS_COUNT, 10);
  }
  // Count GEMINI_KEY_1, GEMINI_KEY_2, … until one is missing
  let count = 0;
  while (process.env[`GEMINI_KEY_${count + 1}`]) count++;
  return count || 1; // never return 0
}

/** Returns "YYYY-MM-DD" in UTC for the current moment. */
function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

/** Human-readable label for a 0-based key index. */
function keyLabel(index) {
  return `Key ${index + 1}`;
}

/**
 * Record a successful Gemini response.
 *
 * @param {number} keyIndex - 0-based index of the key that handled the call
 * @param {object} usageMetadata - { promptTokenCount, candidatesTokenCount, totalTokenCount }
 * @param {string} feature - "summarize" | "banking" | "table"
 */
async function recordSuccess(keyIndex, usageMetadata = {}, feature = "summarize") {
  const date = todayUTC();
  const input  = usageMetadata.promptTokenCount     || 0;
  const output = usageMetadata.candidatesTokenCount || 0;
  const total  = usageMetadata.totalTokenCount      || (input + output);

  const featureKey = ["summarize", "banking", "table"].includes(feature) ? feature : "summarize";

  try {
    // ── Daily stats upsert ──────────────────────────────────────────────────
    await ApiKeyDaily.findOneAndUpdate(
      { keyIndex, date },
      {
        $inc: {
          requestCount: 1,
          inputTokens: input,
          outputTokens: output,
          totalTokens: total,
          [`byFeature.${featureKey}.requests`]: 1,
          [`byFeature.${featureKey}.tokens`]: total,
        },
        $set: {
          keyLabel: keyLabel(keyIndex),
          dailyRequestLimit: DAILY_REQUEST_LIMIT,
          dailyTokenBudget: DAILY_TOKEN_BUDGET,
          lastRequestAt: new Date(),
        },
        $setOnInsert: { keyIndex, date },
      },
      { upsert: true, new: false }
    );

    // ── Real-time state ─────────────────────────────────────────────────────
    await ApiKeyState.findOneAndUpdate(
      { keyIndex: -1 },
      {
        $set: {
          currentKeyIndex: keyIndex,
          lastRequestAt: new Date(),
          lastRequestKeyIndex: keyIndex,
          lastRequestFeature: featureKey,
          lastUsageMetadata: {
            promptTokenCount: input,
            candidatesTokenCount: output,
            totalTokenCount: total,
          },
        },
      },
      { upsert: true }
    );
  } catch (err) {
    // Never crash the user request over a tracking failure
    console.warn("⚠️  usageTracking.recordSuccess failed (non-fatal):", err.message);
  }
}

/**
 * Record a 429 rate-limit hit and key rotation.
 *
 * @param {number} fromKeyIndex - Key that got rate limited
 * @param {number} toKeyIndex   - Key we rotated to
 */
async function recordRateLimit(fromKeyIndex, toKeyIndex) {
  const date = todayUTC();
  try {
    await ApiKeyDaily.findOneAndUpdate(
      { keyIndex: fromKeyIndex, date },
      {
        $inc: { rateLimitHits: 1 },
        $set: {
          keyLabel: keyLabel(fromKeyIndex),
          dailyRequestLimit: DAILY_REQUEST_LIMIT,
          dailyTokenBudget: DAILY_TOKEN_BUDGET,
        },
        $setOnInsert: { keyIndex: fromKeyIndex, date },
      },
      { upsert: true }
    );

    await ApiKeyState.findOneAndUpdate(
      { keyIndex: -1 },
      {
        $set: {
          currentKeyIndex: toKeyIndex,
          lastRotatedAt: new Date(),
        },
      },
      { upsert: true }
    );
  } catch (err) {
    console.warn("⚠️  usageTracking.recordRateLimit failed (non-fatal):", err.message);
  }
}

/**
 * Record a non-429 error on a key.
 *
 * @param {number} keyIndex
 */
async function recordError(keyIndex) {
  const date = todayUTC();
  try {
    await ApiKeyDaily.findOneAndUpdate(
      { keyIndex, date },
      {
        $inc: { errorCount: 1 },
        $set: {
          keyLabel: keyLabel(keyIndex),
          dailyRequestLimit: DAILY_REQUEST_LIMIT,
          dailyTokenBudget: DAILY_TOKEN_BUDGET,
        },
        $setOnInsert: { keyIndex, date },
      },
      { upsert: true }
    );
  } catch (err) {
    console.warn("⚠️  usageTracking.recordError failed (non-fatal):", err.message);
  }
}

/**
 * Fetch today's stats for all 4 keys + current active key.
 * Used by the REST endpoint.
 */
async function getTodayStats() {
  const date = todayUTC();

  const [dailyDocs, stateDoc] = await Promise.all([
    ApiKeyDaily.find({ date }).lean(),
    ApiKeyState.findOne({ keyIndex: -1 }).lean(),
  ]);

  const totalKeys = resolveKeyCount();

  // Build a complete array for all keys (fill zeros for keys with no activity today)
  const keys = Array.from({ length: totalKeys }, (_, i) => {
    const doc = dailyDocs.find((d) => d.keyIndex === i) || {};
    const requests    = doc.requestCount    || 0;
    const totalTokens = doc.totalTokens     || 0;

    const requestPct = Math.min(100, Math.round((requests / DAILY_REQUEST_LIMIT) * 100));
    const tokenPct   = Math.min(100, Math.round((totalTokens / DAILY_TOKEN_BUDGET) * 100));

    return {
      keyIndex:         i,
      keyLabel:         keyLabel(i),
      isActive:         (stateDoc?.currentKeyIndex ?? 0) === i,

      // Today counters
      requestCount:     requests,
      rateLimitHits:    doc.rateLimitHits   || 0,
      errorCount:       doc.errorCount      || 0,
      inputTokens:      doc.inputTokens     || 0,
      outputTokens:     doc.outputTokens    || 0,
      totalTokens,
      byFeature:        doc.byFeature       || { summarize: { requests: 0, tokens: 0 }, banking: { requests: 0, tokens: 0 }, table: { requests: 0, tokens: 0 } },

      // Limits & estimates
      dailyRequestLimit: DAILY_REQUEST_LIMIT,
      dailyTokenBudget:  DAILY_TOKEN_BUDGET,
      remainingRequests: Math.max(0, DAILY_REQUEST_LIMIT - requests),
      remainingTokens:   Math.max(0, DAILY_TOKEN_BUDGET  - totalTokens),
      requestUsagePct:   requestPct,
      tokenUsagePct:     tokenPct,

      // When last used
      lastRequestAt: doc.lastRequestAt || null,
    };
  });

  return {
    date,
    currentKeyIndex: stateDoc?.currentKeyIndex ?? 0,
    lastRotatedAt:   stateDoc?.lastRotatedAt   || null,
    lastRequestAt:   stateDoc?.lastRequestAt   || null,
    lastUsageMetadata: stateDoc?.lastUsageMetadata || null,
    lastRequestFeature: stateDoc?.lastRequestFeature || null,
    keys,
    totals: {
      requestCount:  keys.reduce((s, k) => s + k.requestCount, 0),
      totalTokens:   keys.reduce((s, k) => s + k.totalTokens, 0),
      rateLimitHits: keys.reduce((s, k) => s + k.rateLimitHits, 0),
    },
    limits: {
      dailyRequestLimit: DAILY_REQUEST_LIMIT,
      dailyTokenBudget:  DAILY_TOKEN_BUDGET,
    },
  };
}

/**
 * Fetch historical stats (last N days) for charts.
 *
 * @param {number} days - how many past days to include (default 7)
 */
async function getHistoryStats(days = 7) {
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const docs = await ApiKeyDaily.find({ date: { $in: dates } }).lean();

  return dates.map((date) => {
    const dayDocs = docs.filter((d) => d.date === date);
    return {
      date,
      requestCount: dayDocs.reduce((s, d) => s + (d.requestCount || 0), 0),
      totalTokens:  dayDocs.reduce((s, d) => s + (d.totalTokens  || 0), 0),
      byKey: dayDocs.map((d) => ({
        keyIndex:     d.keyIndex,
        keyLabel:     d.keyLabel,
        requestCount: d.requestCount || 0,
        totalTokens:  d.totalTokens  || 0,
      })),
    };
  });
}

module.exports = { recordSuccess, recordRateLimit, recordError, getTodayStats, getHistoryStats };