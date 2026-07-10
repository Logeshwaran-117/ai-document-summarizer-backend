/**
 * usageRoutes.js
 *
 * REST endpoints for the API key usage dashboard.
 *
 * Mount in server.js:
 *   const usageRoutes = require("./routes/usageRoutes");
 *   app.use("/api/usage", usageRoutes);
 *
 * Endpoints:
 *   GET /api/usage/today       → per-key stats for today
 *   GET /api/usage/history     → last 7 days (or ?days=N)
 *   GET /api/usage/stream      → SSE — pushes an update every 10s
 */

const express = require("express");
const router  = express.Router();
const { requireAdmin } = require("../middleware/adminAuth");
const { getTodayStats, getHistoryStats } = require("../services/usageTrackingService");

// ── Protect all usage routes to admin only ────────────────────────────────────
router.use(requireAdmin);

// GET /api/usage/today
router.get("/today", async (req, res) => {
  try {
    const data = await getTodayStats();
    res.json({ success: true, data });
  } catch (err) {
    console.error("usageRoutes /today error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/usage/history?days=7
router.get("/history", async (req, res) => {
  try {
    const days = Math.min(30, Math.max(1, parseInt(req.query.days || "7", 10)));
    const data = await getHistoryStats(days);
    res.json({ success: true, data });
  } catch (err) {
    console.error("usageRoutes /history error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/usage/stream  — Server-Sent Events, auto-refreshes dashboard
router.get("/stream", (req, res) => {
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.flushHeaders();

  const send = async () => {
    try {
      const data = await getTodayStats();
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (err) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    }
  };

  // Push immediately, then every 10 s
  send();
  const interval = setInterval(send, 10_000);

  req.on("close", () => {
    clearInterval(interval);
    res.end();
  });
});

module.exports = router;