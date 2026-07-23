const mongoose = require("mongoose");

const presentationSchema = new mongoose.Schema(
  {
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: "User",     required: true, index: true },
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: "Document", default: null, index: true },

    filename:       { type: String, required: true },  // e.g. "Q3 Bank Statement.pptx"
    sourceFilename: { type: String, default: "" },     // original uploaded doc filename

    theme:         { type: String, default: "navyGold" },
    detailLevel:   { type: String, default: "standard" },
    chartDensity:  { type: String, default: "auto" },
    includeAgenda: { type: Boolean, default: true },
    includeNotes:  { type: Boolean, default: true },

    slideCount: { type: Number, default: 0 },
    sizeBytes:  { type: Number, default: 0 },

    // ── NEW: AI Wizard fields ────────────────────────────────────────────────
    generatedBy:   { type: String, default: "legacy", enum: ["legacy", "claude-ai", "svg-pipeline", "ai-wizard"] },
    wizardOptions: { type: mongoose.Schema.Types.Mixed, default: null },
    // ────────────────────────────────────────────────────────────────────────

    data: { type: Buffer, required: true },  // .pptx binary
  },
  { timestamps: true }
);

module.exports = mongoose.model("Presentation", presentationSchema);
