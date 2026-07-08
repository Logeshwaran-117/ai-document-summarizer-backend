/**
 * routes/progressRoutes.js
 *
 * TWO endpoints:
 *
 *  GET /api/progress/:jobId
 *    SSE stream. Controllers call emitProgress(jobId, stage, percent, message)
 *    and every connected client immediately gets the event.
 *    Events auto-close after 'done' or 'error'. Job cleaned up after 60 s.
 *
 *  GET /api/usage
 *    Returns { plan, summarize:{used,limit,remaining}, tables:{used,limit,remaining} }
 *    for the currently logged-in user. Used by UsageBadge on the frontend.
 *
 * ── Registration in server.js ────────────────────────────────────────────────
 *   const { router: progressRoutes } = require("./routes/progressRoutes");
 *   app.use("/api", progressRoutes);
 * ────────────────────────────────────────────────────────────────────────────
 *
 * ── startProgressTicker ───────────────────────────────────────────────────────
 * Long single-shot AI calls (e.g. one big generateContent request) don't expose
 * any real incremental progress — the frontend would sit at a fixed percent for
 * however long the call takes, which looks frozen. startProgressTicker() eases
 * the percent upward toward (but never reaching) a ceiling on a timer, cycling
 * through rotating status messages, until the caller stops it (when the real
 * result comes back). This is *simulated* progress, not literal progress — it
 * exists purely to keep the UI feeling alive during a long await.
 * ────────────────────────────────────────────────────────────────────────────
 */

const express = require("express");
const router  = express.Router();

// ── In-process job store ──────────────────────────────────────────────────────
// Map<jobId, { events: Array, listeners: Set<fn>, done: boolean }>
// Using in-process memory is fine for a single-instance Node server.
// For multi-instance deployments replace with Redis pub/sub.
const jobs = new Map();

function getOrCreate(jobId) {
  if (!jobs.has(jobId)) {
    jobs.set(jobId, { events: [], listeners: new Set(), done: false });
  }
  return jobs.get(jobId);
}

/**
 * Emit a progress event.
 * Call this from summarizeController.js and tableController.js.
 *
 * @param {string} jobId    – unique id the frontend generated (crypto.randomUUID())
 * @param {string} stage    – 'uploading' | 'extracting' | 'ai' | 'saving' | 'done' | 'error'
 * @param {number} percent  – 0-100
 * @param {string} message  – human label shown under the progress bar
 */
function emitProgress(jobId, stage, percent, message) {
  if (!jobId) return;

  const job   = getOrCreate(jobId);
  const event = {
    stage,
    percent: Math.min(Math.max(Math.round(percent), 0), 100),
    message,
  };

  job.events.push(event);

  for (const fn of job.listeners) {
    try { fn(event); } catch (_) {}
  }

  // Auto-cleanup 60 s after terminal event
  if (stage === "done" || stage === "error") {
    job.done = true;
    setTimeout(() => jobs.delete(jobId), 60_000);
  }
}

/**
 * Start a simulated progress ticker that eases the percent from `from` toward
 * `to` (asymptotically — it approaches `to` but never reaches it) on a timer,
 * emitting progress events with rotating messages. Use this to wrap a long
 * single-shot async call (e.g. an AI generation call) that has no real
 * incremental progress signal of its own.
 *
 * IMPORTANT: always stop the ticker (call the returned function) in a
 * `finally` block once the real result comes back, so the ticker doesn't
 * keep firing after the stage has moved on.
 *
 * @param {string} jobId
 * @param {object} opts
 * @param {number} [opts.from=55]        – starting percent (should match the last emitProgress call)
 * @param {number} [opts.to=88]          – ceiling the ticker approaches but never reaches;
 *                                          keep this below the percent of the *next* real stage
 * @param {number} [opts.intervalMs=2500]– how often to tick
 * @param {string} [opts.stage="ai"]     – stage label to emit
 * @param {string[]} [opts.messages]     – rotating status messages
 * @returns {() => void} stop – call this to stop the ticker
 */
function startProgressTicker(jobId, {
  from = 55,
  to = 88,
  intervalMs = 2500,
  stage = "ai",
  messages = ["Still working on it…"],
} = {}) {
  let current = from;
  let msgIndex = 0;
  let stopped = false;

  const timer = setInterval(() => {
    if (stopped) return;

    const remaining = to - current;
    // Ease toward `to` — bigger steps early, smaller as we approach the ceiling.
    // Never actually reaches `to`, so it can't collide with the next real stage.
    current += Math.max(remaining * 0.12, 0.4);
    if (current >= to) current = to - 0.01;

    emitProgress(jobId, stage, current, messages[msgIndex % messages.length]);
    msgIndex++;
  }, intervalMs);

  return function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
  };
}

// ── GET /api/progress/:jobId  (SSE) ──────────────────────────────────────────
router.get("/progress/:jobId", (req, res) => {
  const { jobId } = req.params;

  res.setHeader("Content-Type",      "text/event-stream");
  res.setHeader("Cache-Control",     "no-cache");
  res.setHeader("Connection",        "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();

  const send = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    if (typeof res.flush === "function") res.flush(); // compression compat
  };

  // Replay events that arrived before the SSE connection opened
  const job = getOrCreate(jobId);
  for (const ev of job.events) send(ev);

  // Already finished — close immediately
  if (job.done) { res.end(); return; }

  // Register live listener
  job.listeners.add(send);

  // Heartbeat every 20 s to keep the connection alive through proxies / load balancers
  const heartbeat = setInterval(() => {
    res.write(": ping\n\n");
    if (typeof res.flush === "function") res.flush();
  }, 20_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    job.listeners.delete(send);
  });
});

// ── GET /api/usage ────────────────────────────────────────────────────────────
router.get("/usage", async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });

    const User       = require("../models/User");
    const { checkLimit } = require("../config/plans");

    const user        = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const sumResult   = checkLimit(user, "summarize");
    const tableResult = checkLimit(user, "tables");

    res.json({
      plan: user.plan || "free",
      role: user.role || "user",
      summarize: {
        used:      sumResult.used,
        limit:     sumResult.limit,
        remaining: sumResult.remaining,
      },
      tables: {
        used:      tableResult.used,
        limit:     tableResult.limit,
        remaining: tableResult.remaining,
      },
    });
  } catch (err) {
    console.error("Usage fetch error:", err);
    res.status(500).json({ message: "Failed to fetch usage" });
  }
});

module.exports = { router, emitProgress, startProgressTicker };