/**
 * ApiKeyUsage.js
 *
 * Tracks per-key daily usage stats: request counts, token consumption,
 * and rate-limit events. One document per key per calendar day (UTC).
 * A separate singleton document (keyIndex: -1) tracks real-time state.
 */
const mongoose = require("mongoose");

// ── Per-day stats (one doc per key per day) ───────────────────────────────────
const apiKeyDailySchema = new mongoose.Schema(
  {
    keyIndex: { type: Number, required: true },        // 0-based index into GEMINI_KEYS[]
    keyLabel: { type: String, required: true },        // "Key 1" … "Key 4"
    date: { type: String, required: true },            // "YYYY-MM-DD" UTC

    // Request counts
    requestCount: { type: Number, default: 0 },        // successful Gemini responses
    rateLimitHits: { type: Number, default: 0 },       // 429s caught before rotation
    errorCount: { type: Number, default: 0 },          // other non-429 errors

    // Token sums from usageMetadata
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },

    // Per-feature breakdowns
    byFeature: {
      summarize: {
        requests: { type: Number, default: 0 },
        tokens: { type: Number, default: 0 },
      },
      banking: {
        requests: { type: Number, default: 0 },
        tokens: { type: Number, default: 0 },
      },
      table: {
        requests: { type: Number, default: 0 },
        tokens: { type: Number, default: 0 },
      },
    },

    // Configurable daily quotas (copied from env at record creation so history is stable)
    dailyRequestLimit: { type: Number, default: 1500 },
    dailyTokenBudget: { type: Number, default: 1000000 },

    lastRequestAt: { type: Date },
  },
  { timestamps: true }
);

// Unique compound index so upserts work correctly
apiKeyDailySchema.index({ keyIndex: 1, date: 1 }, { unique: true });

// ── Real-time state (one doc total, keyIndex = -1) ────────────────────────────
const apiKeyStateSchema = new mongoose.Schema(
  {
    keyIndex: { type: Number, required: true, default: -1 },  // always -1
    currentKeyIndex: { type: Number, default: 0 },             // which key is active right now
    totalKeys: { type: Number, default: 4 },
    lastRotatedAt: { type: Date },
    lastRequestAt: { type: Date },
    lastRequestKeyIndex: { type: Number },
    lastRequestFeature: { type: String },
    lastUsageMetadata: {
      promptTokenCount: Number,
      candidatesTokenCount: Number,
      totalTokenCount: Number,
    },
  },
  { timestamps: true }
);

apiKeyStateSchema.index({ keyIndex: 1 }, { unique: true });

const ApiKeyDaily = mongoose.model("ApiKeyDaily", apiKeyDailySchema);
const ApiKeyState = mongoose.model("ApiKeyState", apiKeyStateSchema);

module.exports = { ApiKeyDaily, ApiKeyState };