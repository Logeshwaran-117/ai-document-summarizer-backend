const { incrementUsage, deductTokens } = require("../middleware/planLimit");
const { extractText, isEmptyContent } = require("../services/extractText");
const { extractTableData, extractTableFromImage } = require("../services/geminiService");
const TableExtraction = require("../models/TableExtraction");
const { emitProgress, startProgressTicker } = require("../routes/progressRoutes");

async function extractTable(req, res) {
  // jobId sent by the frontend so we can push real-time SSE progress
  const jobId = req.body?.jobId || null;

  // Token tracking for this session
  let sessionTokens = 0;
  const trackUsage = (usage) => { sessionTokens += (usage?.totalTokenCount || 0); };

  try {
    if (!req.file) {
      emitProgress(jobId, "error", 0, "No file uploaded.");
      return res.status(400).json({ success: false, message: "No file uploaded." });
    }

    if (!req.user) {
      emitProgress(jobId, "error", 0, "Not authenticated.");
      return res.status(401).json({ success: false, message: "Not authenticated." });
    }

    const rawFields    = req.body.fields;
    const parsedFields = typeof rawFields === "string" ? JSON.parse(rawFields) : rawFields;
    const fields       = (Array.isArray(parsedFields) ? parsedFields : [])
      .map((f) => String(f).trim())
      .filter(Boolean);

    if (fields.length === 0) {
      emitProgress(jobId, "error", 0, "No fields specified.");
      return res.status(400).json({ success: false, message: "At least one field is required." });
    }

    // ── Stage 1: file received ────────────────────────────────────────────────
    emitProgress(jobId, "uploading", 12, "File received — reading content…");

    const extracted = await extractText(req.file);

    // ── Stage 2: content extracted ────────────────────────────────────────────
    emitProgress(jobId, "extracting", 35, "Content extracted — structuring fields…");

    if (isEmptyContent(extracted)) {
      emitProgress(jobId, "error", 0, "Document appears to be empty.");
      return res.status(400).json({
        success: false,
        message:
          "The uploaded document appears to be empty. Please upload a file that contains actual content.",
      });
    }

    // ── Stage 3: AI extraction ────────────────────────────────────────────────
    const isImage = extracted && extracted.isImage;
    emitProgress(
      jobId,
      "ai",
      55,
      isImage
        ? "Gemini Vision is scanning your image for table data…"
        : `AI is extracting ${fields.length} field${fields.length !== 1 ? "s" : ""} from your document…`
    );

    // Simulated progress while we wait on the single long AI extraction
    // call — there's no real incremental signal, so we ease the bar toward
    // 84% (staying below the "saving" stage's 88%) and stop the instant
    // the real response lands.
    const stopTicker = startProgressTicker(jobId, {
      from: 55,
      to: 84,
      intervalMs: 2200,
      stage: "ai",
      messages: isImage
        ? [
            "Gemini Vision is scanning your image…",
            "Locating tables and rows…",
            "Matching fields to your columns…",
            "Cleaning up extracted values…",
          ]
        : [
            `AI is extracting ${fields.length} field${fields.length !== 1 ? "s" : ""}…`,
            "Scanning rows and columns…",
            "Matching fields to your document…",
            "Cleaning up extracted values…",
          ],
    });

    let rows;
    try {
      if (isImage) {
        rows = await extractTableFromImage(extracted.base64Data, extracted.mimeType, fields, trackUsage);
      } else {
        const tableText = (extracted && typeof extracted.rawText === 'string') ? extracted.rawText : extracted;
        rows = await extractTableData(tableText, fields, trackUsage);
      }
    } finally {
      stopTicker();
    }

    // ── Stage 4: saving ───────────────────────────────────────────────────────
    emitProgress(jobId, "saving", 88, `${rows.length} row${rows.length !== 1 ? "s" : ""} found — saving…`);

    const saved = await TableExtraction.create({
      userId:   req.user._id,
      filename: req.file.originalname,
      fields,
      rows,
    });

    // Increment usage counter (non-blocking)
    incrementUsage(req.user._id, "tables").catch(() => {});

    // Deduct tokens consumed by all AI calls in this pipeline
    const tokenStatus = await deductTokens(req.user._id, sessionTokens);

    // ── Stage 5: done ─────────────────────────────────────────────────────────
    emitProgress(jobId, "done", 100, `Table ready — ${rows.length} rows extracted! ✅`);

    res.json({
      success:   true,
      _id:       saved._id,
      filename:  saved.filename,
      fields:    saved.fields,
      rows:      saved.rows,
      createdAt: saved.createdAt,
      tokensUsed: sessionTokens,
      tokenStatus,
    });
  } catch (error) {
    console.error("Table extraction error:", error);
    emitProgress(jobId, "error", 0, error.message || "Something went wrong.");
    res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = extractTable;