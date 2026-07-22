// server/models/Document.js
// 3.2 — Added tags field for user-defined labels.

const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant'], required: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const documentSchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  filename:      String,
  extractedText: String,
  summary:       String,
  stats: {
    words:       Number,
    characters:  Number,
    readingTime: Number
  },
  chatHistory: { type: [chatMessageSchema], default: [] },
  uploadedAt:  { type: Date, default: Date.now },

  // ── Share link support ──────────────────────────────────────────────────
  shareToken: { type: String, default: undefined, index: { unique: true, sparse: true } },

  // ── 3.2: Tags / Folders ─────────────────────────────────────────────────
  // User-defined string labels, max 10 per document.
  tags: { type: [String], default: [] },
});

module.exports = mongoose.model('Document', documentSchema);