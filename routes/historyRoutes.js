const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { deleteHistory } = require("../services/historyService");
const Document = require("../models/Document");
const answerQuestion = require("../services/qaService");

const EXT_MAP = {
  pdf: /\.pdf$/i,
  docx: /\.docx$/i,
  txt: /\.txt$/i,
  xlsx: /\.(xlsx|xls|csv)$/i,
  jpg: /\.(jpg|jpeg)$/i,
  png: /\.png$/i,
};

const SORT_MAP = {
  newest: { uploadedAt: -1 },
  oldest: { uploadedAt: 1 },
  wordsDesc: { "stats.words": -1 },
  wordsAsc: { "stats.words": 1 },
};

// ── List history ──────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
    const search = (req.query.search || "").trim();
    const fileType = (req.query.fileType || "all").toLowerCase();
    const dateFrom = req.query.dateFrom;
    const dateTo = req.query.dateTo;
    const minWords = req.query.minWords ? parseInt(req.query.minWords) : null;
    const maxWords = req.query.maxWords ? parseInt(req.query.maxWords) : null;
    const sortKey = SORT_MAP[req.query.sort] ? req.query.sort : "newest";

    const filter = { userId: req.user._id };

    if (search) {
      filter.filename = { $regex: search, $options: "i" };
    }

    if (fileType !== "all" && EXT_MAP[fileType]) {
      filter.filename = { ...(filter.filename || {}), $regex: EXT_MAP[fileType] };
      if (search) {
        delete filter.filename;
        filter.$and = [
          { filename: { $regex: search, $options: "i" } },
          { filename: { $regex: EXT_MAP[fileType] } },
        ];
      }
    }

    if (dateFrom || dateTo) {
      filter.uploadedAt = {};
      if (dateFrom) filter.uploadedAt.$gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        filter.uploadedAt.$lte = end;
      }
    }

    if (minWords !== null || maxWords !== null) {
      filter["stats.words"] = {};
      if (minWords !== null) filter["stats.words"].$gte = minWords;
      if (maxWords !== null) filter["stats.words"].$lte = maxWords;
    }

    const total = await Document.countDocuments(filter);
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    const safePage = Math.min(page, totalPages);

    const documents = await Document.find(filter)
      .sort(SORT_MAP[sortKey])
      .skip((safePage - 1) * limit)
      .limit(limit);

    res.json({
      documents,
      total,
      page: safePage,
      totalPages,
      limit,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch history" });
  }
});

// ── Get single document (authenticated) ───────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });
    const doc = await Document.findOne({ _id: req.params.id, userId: req.user._id });
    if (!doc) return res.status(404).json({ message: "Document not found" });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch document" });
  }
});

// ── Delete document ───────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });
    await deleteHistory(req.params.id, req.user._id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete" });
  }
});

// ── Generate / revoke a public share link ─────────────────────────────────────
//   POST /api/history/:id/share        → creates shareToken, returns shareUrl
//   DELETE /api/history/:id/share      → clears shareToken (revoke access)

router.post("/:id/share", async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });

    const doc = await Document.findOne({ _id: req.params.id, userId: req.user._id });
    if (!doc) return res.status(404).json({ message: "Document not found" });

    // Re-use existing token or generate a fresh one
    if (!doc.shareToken) {
      doc.shareToken = crypto.randomBytes(24).toString("hex");
      await doc.save();
    }

    const origin = req.headers.origin || `${req.protocol}://${req.get("host")}`;
    const shareUrl = `${origin}/shared/${doc.shareToken}`;

    res.json({ success: true, shareToken: doc.shareToken, shareUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to generate share link" });
  }
});

router.delete("/:id/share", async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });

    const doc = await Document.findOne({ _id: req.params.id, userId: req.user._id });
    if (!doc) return res.status(404).json({ message: "Document not found" });

    doc.shareToken = undefined;
    await doc.save();

    res.json({ success: true, message: "Share link revoked" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to revoke share link" });
  }
});

// ── Public share view (no auth required) ──────────────────────────────────────
//   GET /api/history/shared/:token  → returns summary + filename only (no chat, no extracted text)
router.get("/shared/:token", async (req, res) => {
  try {
    const doc = await Document.findOne({ shareToken: req.params.token }).select(
      "filename summary stats uploadedAt shareToken"
    );
    if (!doc) return res.status(404).json({ message: "Share link is invalid or has been revoked" });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: "Failed to load shared summary" });
  }
});

// ── Chat history ──────────────────────────────────────────────────────────────
router.get("/:id/chat", async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });
    const doc = await Document.findOne({ _id: req.params.id, userId: req.user._id }).select("chatHistory");
    if (!doc) return res.status(404).json({ message: "Document not found" });
    res.json(doc.chatHistory || []);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch chat history" });
  }
});

// ── Ask a question ────────────────────────────────────────────────────────────
router.post("/:id/chat", async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });

    const { question } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ message: "Question is required" });
    }

    const doc = await Document.findOne({ _id: req.params.id, userId: req.user._id });
    if (!doc) return res.status(404).json({ message: "Document not found" });

    const answer = await answerQuestion(doc.extractedText, question, doc.chatHistory || []);

    doc.chatHistory.push({ role: "user", text: question });
    doc.chatHistory.push({ role: "assistant", text: answer });
    await doc.save();

    res.json({ answer, chatHistory: doc.chatHistory });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to get answer" });
  }
});

router.put("/:id/tags", async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });
 
    const { tags } = req.body;
    if (!Array.isArray(tags)) return res.status(400).json({ message: "tags must be an array" });
 
    // Sanitise: trim, lowercase, max 20 chars each, max 10 tags
    const cleaned = tags
      .map((t) => String(t).trim().toLowerCase().slice(0, 20))
      .filter(Boolean)
      .slice(0, 10);
 
    const doc = await Document.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: { tags: cleaned } },
      { new: true, select: "tags" }
    );
 
    if (!doc) return res.status(404).json({ message: "Document not found" });
 
    res.json({ success: true, tags: doc.tags });
  } catch (err) {
    console.error("Set tags error:", err);
    res.status(500).json({ message: "Failed to update tags" });
  }
});
 
// ── 3.2: Get all distinct tags for the current user ───────────────────────────
// GET /api/history/tags
router.get("/tags", async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });
 
    const tags = await Document.distinct("tags", { userId: req.user._id });
    res.json({ tags: tags.filter(Boolean).sort() });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch tags" });
  }
});
 

module.exports = router;