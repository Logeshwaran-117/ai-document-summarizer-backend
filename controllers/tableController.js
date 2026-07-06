const { extractText, isEmptyContent } = require("../services/extractText");
const { extractTableData, extractTableFromImage } = require("../services/geminiService");
const TableExtraction = require("../models/TableExtraction");

async function extractTable(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded." });
    }

    if (!req.user) {
      return res.status(401).json({ success: false, message: "Not authenticated." });
    }

    const rawFields = req.body.fields;
    const parsedFields = typeof rawFields === "string" ? JSON.parse(rawFields) : rawFields;
    const fields = (Array.isArray(parsedFields) ? parsedFields : [])
      .map((f) => String(f).trim())
      .filter(Boolean);

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: "At least one field is required." });
    }

    const extracted = await extractText(req.file);

    // ── Empty document guard ──────────────────────────────────────────────
    if (isEmptyContent(extracted)) {
      return res.status(400).json({
        success: false,
        message: "The uploaded document appears to be empty. Please upload a file that contains actual content.",
      });
    }

    let rows;
    if (extracted && extracted.isImage) {
      rows = await extractTableFromImage(extracted.base64Data, extracted.mimeType, fields);
    } else {
      rows = await extractTableData(extracted, fields);
    }

    const saved = await TableExtraction.create({
      userId: req.user._id,
      filename: req.file.originalname,
      fields,
      rows,
    });

    res.json({
      success: true,
      _id: saved._id,
      filename: saved.filename,
      fields: saved.fields,
      rows: saved.rows,
      createdAt: saved.createdAt,
    });
  } catch (error) {
    console.error("Table extraction error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = extractTable;