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
  // Populated by POST /api/history/:id/share; cleared by DELETE /api/history/:id/share
  // Indexed so the public /shared/:token lookup is fast.
  shareToken: { type: String, default: undefined, index: { unique: true, sparse: true } },
});

module.exports = mongoose.model('Document', documentSchema);