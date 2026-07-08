const { limitAction } = require('../middleware/planLimit');
const express = require("express");
const router = express.Router();

const upload = require("../middleware/upload");
const { extractText, isEmptyContent } = require("../services/extractText");
const { suggestTableFields, suggestTableFieldsFromImage, callWithRotation } = require("../services/geminiService");
const extractTable = require("../controllers/tableController");
const TableExtraction = require("../models/TableExtraction");

router.post("/extract-table", upload.single("document"), limitAction("tables"), extractTable);

// GET /api/tables — paginated list for the History "Tables" tab
const TABLE_EXT_MAP = {
  pdf: /\.pdf$/i,
  docx: /\.docx$/i,
  txt: /\.txt$/i,
  xlsx: /\.(xlsx|xls|csv)$/i,
  jpg: /\.(jpg|jpeg)$/i,
  png: /\.png$/i,
};

const TABLE_SORT_MAP = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
};

router.get("/tables", async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
    const search = (req.query.search || "").trim();
    const fileType = (req.query.fileType || "all").toLowerCase();
    const dateFrom = req.query.dateFrom;
    const dateTo = req.query.dateTo;
    const sortKey = TABLE_SORT_MAP[req.query.sort] ? req.query.sort : "newest";

    const filter = { userId: req.user._id };

    if (search) {
      filter.filename = { $regex: search, $options: "i" };
    }

    if (fileType !== "all" && TABLE_EXT_MAP[fileType]) {
      filter.filename = { ...(filter.filename || {}), $regex: TABLE_EXT_MAP[fileType] };
      if (search) {
        delete filter.filename;
        filter.$and = [
          { filename: { $regex: search, $options: "i" } },
          { filename: { $regex: TABLE_EXT_MAP[fileType] } },
        ];
      }
    }

    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    const total = await TableExtraction.countDocuments(filter);
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    const safePage = Math.min(page, totalPages);

    const tables = await TableExtraction.find(filter)
      .sort(TABLE_SORT_MAP[sortKey])
      .skip((safePage - 1) * limit)
      .limit(limit);

    res.json({ tables, total, page: safePage, totalPages, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch tables" });
  }
});

router.get("/tables/:id", async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });
    const table = await TableExtraction.findOne({ _id: req.params.id, userId: req.user._id });
    if (!table) return res.status(404).json({ message: "Table not found" });
    res.json(table);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch table" });
  }
});

router.delete("/tables/:id", async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });
    await TableExtraction.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete table" });
  }
});

// ── Table Chat (QA) endpoints ─────────────────────────────────────────────────

// GET /api/tables/:id/chat — fetch chat history
router.get("/tables/:id/chat", async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });
    const table = await TableExtraction.findOne({ _id: req.params.id, userId: req.user._id }).select("chatHistory");
    if (!table) return res.status(404).json({ message: "Table not found" });
    res.json(table.chatHistory || []);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch chat history" });
  }
});

// POST /api/tables/:id/chat — ask a question about the table
router.post("/tables/:id/chat", async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });

    const { question } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ message: "Question is required" });
    }

    const table = await TableExtraction.findOne({ _id: req.params.id, userId: req.user._id });
    if (!table) return res.status(404).json({ message: "Table not found" });

    // Convert table rows to a readable text representation for the AI
    const tableText = buildTableText(table.fields, table.rows);

    const historyText = (table.chatHistory || [])
      .slice(-6)
      .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
      .join("\n");

    const prompt = `You are a helpful data analyst assistant. The user has a structured data table and is asking questions about it.

RULES:
- Answer ONLY using data found in the table below. Do not use outside knowledge.
- If the answer is not in the table, say clearly: "I couldn't find that information in this table."
- Be concise and direct. Use numbers and specific values from the table.
- For calculations (totals, averages, counts), compute them from the data.
- Use plain text or simple Markdown (bold, bullet points, tables) where it improves clarity.
- Do not repeat the entire table back. Focus on answering the question.

${historyText ? `Previous conversation:\n${historyText}\n` : ""}

Table: ${table.filename}
Fields: ${table.fields.join(", ")}
Total rows: ${table.rows.length}

Data:
${tableText}

Question: ${question.trim()}

Answer:`;

    const answer = await callWithRotation(() => [{ text: prompt }], 2048, "gemini-2.5-flash");

    table.chatHistory.push({ role: "user", text: question.trim() });
    table.chatHistory.push({ role: "assistant", text: answer });
    await table.save();

    res.json({ answer, chatHistory: table.chatHistory });
  } catch (err) {
    console.error("Table chat error:", err);
    res.status(500).json({ message: err.message || "Failed to get answer" });
  }
});

// Helper: convert rows to a compact text format the AI can read
function buildTableText(fields, rows) {
  if (!rows || rows.length === 0) return "No data rows.";
  // Cap at 300 rows to stay within token limits; summarize if more
  const cap = 300;
  const slice = rows.slice(0, cap);
  const header = fields.join(" | ");
  const divider = fields.map(() => "---").join(" | ");
  const body = slice.map(row => fields.map(f => row[f] ?? "").join(" | ")).join("\n");
  const note = rows.length > cap ? `\n[Showing first ${cap} of ${rows.length} rows]` : "";
  return `${header}\n${divider}\n${body}${note}`;
}

// POST /api/suggest-fields — AI reads the doc and returns suggested column names
router.post("/suggest-fields", upload.single("document"), async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Not authenticated" });
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const extracted = await extractText(req.file);

    if (isEmptyContent(extracted)) {
      return res.status(400).json({
        message: "The uploaded document appears to be empty. Please upload a file that contains actual content.",
      });
    }

    let fields;

    if (extracted && extracted.isImage) {
      fields = await suggestTableFieldsFromImage(extracted.base64Data, extracted.mimeType);
    } else {
      fields = await suggestTableFields(extracted);
    }

    res.json({ fields });
  } catch (err) {
    console.error("suggest-fields error:", err);
    res.status(500).json({ message: err.message || "Failed to suggest fields" });
  }
});

module.exports = router;