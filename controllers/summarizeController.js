const { incrementUsage } = require('../middleware/planLimit');
const { extractText, isEmptyContent } = require("../services/extractText");
const { generateSummary, summarizeImage, extractTextFromImage } = require("../services/geminiService");
const { saveHistory } = require("../services/historyService");

async function summarizeDocument(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded." });
    }

    if (!req.user) {
      return res.status(401).json({ success: false, message: "Not authenticated." });
    }

    const extracted = await extractText(req.file);

    // ── Empty document guard ──────────────────────────────────────────────────
    // Catches blank .txt / .docx / .pdf / .xlsx / .csv before hitting the AI.
    // Images are never blocked here — blank-image detection happens below after
    // Gemini Vision returns its description.
    if (isEmptyContent(extracted)) {
      return res.status(400).json({
        success: false,
        message: "The uploaded document appears to be empty. Please upload a file that contains actual content.",
      });
    }

    let summary;
    let extractedText;

    if (extracted && extracted.isImage) {
      // Image file — use Gemini Vision for summary, then extract raw text for chat
      console.log(`📷 Image file detected: ${req.file.originalname}`);

      // Run summary and text extraction in parallel to avoid extra latency
      const [imageSummary, imageText] = await Promise.all([
        summarizeImage(extracted.base64Data, extracted.mimeType),
        extractTextFromImage(extracted.base64Data, extracted.mimeType),
      ]);

      // ── Blank image guard ───────────────────────────────────────────────────
      // Gemini Vision describes blank/white images with short, tell-tale phrases.
      // Only block when the summary is short (< 300 chars) AND matches a pattern —
      // a real image will always produce a longer, more descriptive response.
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
        return res.status(400).json({
          success: false,
          message:
            "The uploaded image appears to be blank or contains no visible content. Please upload an image with actual content.",
        });
      }

      summary = imageSummary;
      // Store the real transcribed text so document chat has genuine content.
      // Fall back to a descriptive placeholder only if extraction truly returns nothing.
      extractedText = (imageText && imageText.trim().length > 20)
        ? imageText.trim()
        : "[Image file — text could not be extracted]";

      console.log(`📝 Image text extracted: ${extractedText.length} chars`);
    } else {
      // Text-based file — use text summarization (auto-detects banking)
      extractedText = extracted;
      summary = await generateSummary(extractedText);
    }

    const wordSource = extractedText.startsWith("[Image") ? summary : extractedText;
    const words = wordSource.trim().split(/\s+/).length;
    const characters = wordSource.length;
    const readingTime = Math.ceil(words / 200);

    const saved = await saveHistory(req.user._id, {
      filename: req.file.originalname,
      extractedText,
      summary,
      stats: { words, characters, readingTime }
    });

    res.json({
      success: true,
      _id: saved._id,
      filename: req.file.originalname,
      extractedText,
      summary,
      stats: { words, characters, readingTime }
    });

  } catch (error) {
    console.error("Server Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = summarizeDocument;