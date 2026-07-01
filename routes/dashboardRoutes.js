const express = require("express");
const router = express.Router();
const Document = require("../models/Document");

router.get("/stats", async (req, res) => {
  if (!req.user) return res.status(401).json({ message: "Not authenticated" });

  const userId = req.user._id;
  const total = await Document.countDocuments({ userId });
  const summaries = await Document.countDocuments({ userId, summary: { $exists: true } });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayUploads = await Document.countDocuments({ userId, uploadedAt: { $gte: today } });

  res.json({ total, summaries, todayUploads });
});

// Accurate per-day upload counts for the last 7 days, across the user's ENTIRE history
router.get("/weekly-uploads", async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });

    const start = new Date();
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);

    const docs = await Document.find({
      userId: req.user._id,
      uploadedAt: { $gte: start },
    }).select("uploadedAt");

    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString("en-US", { weekday: "short" });
      const count = docs.filter(
        (doc) => new Date(doc.uploadedAt).toDateString() === d.toDateString()
      ).length;
      days.push({ day: label, uploads: count });
    }

    res.json(days);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch weekly uploads" });
  }
});

module.exports = router;
