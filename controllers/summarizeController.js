const { incrementUsage } = require("../middleware/planLimit");
const { extractText, isEmptyContent } = require("../services/extractText");
const { generateSummary, summarizeImage, extractTextFromImage } = require("../services/geminiService");
const { saveHistory } = require("../services/historyService");
const { emitProgress, startProgressTicker } = require("../routes/progressRoutes");

async function summarizeDocument(req, res) {
  // jobId is sent by the frontend alongside the file so we can push SSE progress
  const jobId = req.body?.jobId || null;

  try {
    if (!req.file) {
      emitProgress(jobId, "error", 0, "No file uploaded.");
      return res.status(400).json({ success: false, message: "No file uploaded." });
    }

    if (!req.user) {
      emitProgress(jobId, "error", 0, "Not authenticated.");
      return res.status(401).json({ success: false, message: "Not authenticated." });
    }

    // ── Stage 1: file received ────────────────────────────────────────────────
    emitProgress(jobId, "uploading", 15, "File received — reading content…");

    const extracted = await extractText(req.file);

    // ── Stage 2: text / image extracted ──────────────────────────────────────
    emitProgress(jobId, "extracting", 35, "Content extracted — sending to AI…");

    // ── Empty document guard ──────────────────────────────────────────────────
    if (isEmptyContent(extracted)) {
      emitProgress(jobId, "error", 0, "Document appears to be empty.");
      return res.status(400).json({
        success: false,
        message:
          "The uploaded document appears to be empty. Please upload a file that contains actual content.",
      });
    }

    let summary;
    let extractedText;

    if (extracted && extracted.isImage) {
      // ── Stage 3 (image path): Gemini Vision ──────────────────────────────
      emitProgress(jobId, "ai", 55, "Gemini Vision is analyzing your image…");
      console.log(`📷 Image file detected: ${req.file.originalname}`);

      // Simulated progress while we wait on the vision calls — there's no
      // real incremental signal from Gemini for a single request, so we
      // ease the bar toward 84% (staying below the "saving" stage's 85%)
      // and stop the instant the real response lands.
      const stopTicker = startProgressTicker(jobId, {
        from: 55,
        to: 84,
        intervalMs: 2200,
        stage: "ai",
        messages: [
          "Gemini Vision is analyzing your image…",
          "Reading text and layout in the image…",
          "Working out what matters most…",
          "Putting the summary together…",
        ],
      });

      let imageSummary, imageText;
      try {
        [imageSummary, imageText] = await Promise.all([
          summarizeImage(extracted.base64Data, extracted.mimeType),
          extractTextFromImage(extracted.base64Data, extracted.mimeType),
        ]);
      } finally {
        stopTicker();
      }

      const BLANK_IMAGE_PATTERNS = [
        /\bblank\b/i,
        /\bempty\b/i,
        /\bno (visible |discernible |meaningful )?content\b/i,
        /\bno text\b/i,
        /\bwhite (image|background|page|canvas)\b/i,
        /\bsolid (white|black|colou?r)\b/i,
        /\bfeatureless\b/i,
        /\bnothing (is |to )?(visible|shown|present|depicted)\b/i,
        /contains? no (text|data|information|content)/i,
      ];
      const looksBlank =
        imageSummary.trim().length < 300 &&
        BLANK_IMAGE_PATTERNS.some((re) => re.test(imageSummary));

      if (looksBlank) {
        emitProgress(jobId, "error", 0, "Image appears blank.");
        return res.status(400).json({
          success: false,
          message:
            "The uploaded image appears to be blank or contains no visible content. Please upload an image with actual content.",
        });
      }

      summary = imageSummary;
      extractedText =
        imageText && imageText.trim().length > 20
          ? imageText.trim()
          : "[Image file — text could not be extracted]";

      console.log(`📝 Image text extracted: ${extractedText.length} chars`);
    } else {
      // ── Stage 3 (text path): generate summary ────────────────────────────
      emitProgress(jobId, "ai", 55, "AI is reading and summarizing your document…");

      // Same idea as the image path above: keep the bar moving while we
      // wait on the single long generateSummary() call.
      const stopTicker = startProgressTicker(jobId, {
        from: 55,
        to: 84,
        intervalMs: 2200,
        stage: "ai",
        messages: [
          "AI is reading through the document…",
          "Pulling out the key points…",
          "Structuring the summary…",
          "Almost done — polishing it up…",
        ],
      });

      try {
        extractedText = (extracted && typeof extracted.rawText === 'string') ? extracted.rawText : extracted;
        summary = await generateSummary(extractedText);
      } finally {
        stopTicker();
      }
    }

    // ── Stage 4: saving ───────────────────────────────────────────────────────
    emitProgress(jobId, "saving", 85, "Summary ready — saving to history…");

    const wordSource   = extractedText.startsWith("[Image") ? summary : extractedText;
    const words        = wordSource.trim().split(/\s+/).length;
    const characters   = wordSource.length;
    const readingTime  = Math.ceil(words / 200);

    const saved = await saveHistory(req.user._id, {
      filename: req.file.originalname,
      extractedText,
      summary,
      stats: { words, characters, readingTime },
    });

    // Increment usage counter (non-blocking — don't await to keep response fast)
    incrementUsage(req.user._id, "summarize").catch(() => {});

    // ── Stage 5: done ─────────────────────────────────────────────────────────
    emitProgress(jobId, "done", 100, "Summary complete! ✅");

    res.json({
      success: true,
      _id: saved._id,
      filename: req.file.originalname,
      extractedText,
      summary,
      stats: { words, characters, readingTime },
    });
  } catch (error) {
    console.error("Server Error:", error);
    emitProgress(jobId, "error", 0, error.message || "Something went wrong.");
    res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = summarizeDocument;