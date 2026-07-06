const mongoose = require("mongoose");

const presentationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: "Document", default: null, index: true },

    filename: { type: String, required: true },       // e.g. "Q3 Bank Statement.pptx" (display name)
    sourceFilename: { type: String, default: "" },     // original uploaded doc filename, for reference

    theme: { type: String, default: "navyGold" },
    detailLevel: { type: String, default: "standard" },
    includeAgenda: { type: Boolean, default: true },
    includeNotes: { type: Boolean, default: true },

    slideCount: { type: Number, default: 0 },
    sizeBytes: { type: Number, default: 0 },

    data: { type: Buffer, required: true },            // the actual .pptx binary
  },
  { timestamps: true } // createdAt / updatedAt
);

module.exports = mongoose.model("Presentation", presentationSchema);
