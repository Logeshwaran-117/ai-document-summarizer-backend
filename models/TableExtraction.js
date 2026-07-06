const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema({
  role: { type: String, enum: ["user", "assistant"], required: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const tableExtractionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  filename: String,
  fields: { type: [String], default: [] },
  rows: { type: [mongoose.Schema.Types.Mixed], default: [] },
  chatHistory: { type: [chatMessageSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("TableExtraction", tableExtractionSchema);
