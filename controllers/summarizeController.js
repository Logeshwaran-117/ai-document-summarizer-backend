const extractText = require("../services/extractText");
const generateSummary = require("../services/geminiService");
const { saveHistory } = require("../services/historyService");

async function summarizeDocument(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded." });
    }

    if (!req.user) {
      return res.status(401).json({ success: false, message: "Not authenticated." });
    }

    const extractedText = await extractText(req.file);
    const summary = await generateSummary(extractedText);
    const words = extractedText.trim().split(/\s+/).length;
    const characters = extractedText.length;
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
