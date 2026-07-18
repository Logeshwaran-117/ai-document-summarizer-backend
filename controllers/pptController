/**
 * pptController.js
 *
 * Handles the PPT-specific upload endpoint:
 *   POST /api/ppt/upload-and-generate
 *
 * Flow:
 *   1. Accept file upload (PDF, DOCX, TXT, images, etc.)
 *   2. Extract raw text via extractText() — same service used by summarize
 *   3. Optionally save to Document model so it appears in history
 *   4. Forward documentText + wizardOptions to /generate-ppt-ai pipeline
 *
 * This controller deliberately does NOT call generateSummary() first —
 * the AI reads the original document text directly.
 */

const { extractText, isEmptyContent } = require("../services/extractText");
const Document = require("../models/Document");

// Safe progress emitter — gracefully falls back to a no-op if progressRoutes
// doesn't export emitProgress (e.g. the SSE route isn't registered yet).
let _emitProgress;
try {
  ({ emitProgress: _emitProgress } = require("../routes/progressRoutes"));
} catch (_) { /* progressRoutes not available */ }
const emitProgress = (jobId, ...args) => {
  try { if (jobId && typeof _emitProgress === "function") _emitProgress(jobId, ...args); }
  catch (_) { /* never crash on progress emit */ }
};
const Presentation = require("../models/Presentation");
const { generatePresentationPlan } = require("../services/presentationAiService");

// Reuse buildAIDeck from pptRoutes — we import it via a shared helper.
// Since buildAIDeck is defined inside pptRoutes.js (not exported), we
// call the /generate-ppt-ai route internally via the shared service layer.
// This controller only handles extraction + progress; deck-building stays in pptRoutes.

async function uploadAndExtract(req, res) {
  const jobId = req.body?.jobId || null;

  try {
    if (!req.file) {
      emitProgress(jobId, "error", 0, "No file uploaded.");
      return res.status(400).json({ success: false, message: "No file uploaded." });
    }
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Not authenticated." });
    }

    // ── Stage 1: extract text ────────────────────────────────────────────────
    emitProgress(jobId, "uploading", 15, "Reading document…");

    const extracted = await extractText(req.file);

    if (isEmptyContent(extracted)) {
      emitProgress(jobId, "error", 0, "Document appears to be empty.");
      return res.status(400).json({
        success: false,
        message: "The uploaded document appears to be empty. Please upload a file with readable content.",
      });
    }

    let documentText = "";

    if (extracted && extracted.isImage) {
      // For images: return base64 so the AI endpoint can handle vision
      emitProgress(jobId, "extracting", 40, "Image detected — returning for vision processing…");
      return res.json({
        success: true,
        isImage: true,
        base64Data: extracted.base64Data,
        mimeType: extracted.mimeType,
        filename: req.file.originalname,
      });
    } else {
      // extractText() can return: a plain string, { text }, { content }, or { pages }
      if (typeof extracted === "string") {
        documentText = extracted;
      } else if (extracted?.text) {
        documentText = extracted.text;
      } else if (extracted?.content) {
        documentText = extracted.content;
      } else if (Array.isArray(extracted?.pages)) {
        documentText = extracted.pages.map(p => p.text || p.content || "").join("\n");
      } else {
        documentText = JSON.stringify(extracted); // last resort — at least send something
      }
      console.log(`[pptController] documentText length: ${documentText.length}`);
    }

    emitProgress(jobId, "extracting", 50, "Text extracted — ready for AI…");

    // ── Stage 2: Save as Document (for history) ──────────────────────────────
    const wordCount = documentText.split(/\s+/).filter(Boolean).length;
    const charCount = documentText.length;

    const doc = await Document.create({
      userId: req.user._id,
      filename: req.file.originalname,
      extractedText: documentText,
      summary: "", // No summary — PPT engine reads original text
      stats: {
        words: wordCount,
        characters: charCount,
        readingTime: Math.ceil(wordCount / 200),
      },
    });

    emitProgress(jobId, "extracting", 65, "Document saved — returning text…");

    return res.json({
      success: true,
      isImage: false,
      documentText,
      documentId: doc._id.toString(),
      filename: req.file.originalname,
      stats: { words: wordCount, characters: charCount },
    });
  } catch (err) {
    console.error("PPT upload error:", err);
    emitProgress(jobId, "error", 0, err.message || "Failed to process document.");
    return res.status(500).json({ success: false, message: err.message || "Failed to process document." });
  }
}

module.exports = { uploadAndExtract };