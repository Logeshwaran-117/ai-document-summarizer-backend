const fs = require("fs");
const path = require("path");
const pdf = require("pdf-parse");
const mammoth = require("mammoth");
const Tesseract = require("tesseract.js");
const os = require("os");

const MIN_TEXT_LENGTH = 50;

async function extractWithOCR(filePath) {
  console.log("Scanned PDF detected — running OCR...");

  // Use pdfjs-dist to render pages to canvas, then OCR each page
  const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
  const { createCanvas } = require("canvas");

  const data = new Uint8Array(fs.readFileSync(filePath));
  const pdfDoc = await pdfjsLib.getDocument({ data }).promise;
  const pageCount = Math.min(pdfDoc.numPages, 20);

  console.log(`OCR: processing ${pageCount} page(s)...`);

  const pageTexts = [];

  for (let i = 1; i <= pageCount; i++) {
    try {
      const page = await pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 }); // 2x scale = better OCR quality

      const canvas = createCanvas(viewport.width, viewport.height);
      const context = canvas.getContext("2d");

      await page.render({ canvasContext: context, viewport }).promise;

      // Convert canvas to PNG buffer for Tesseract
      const imageBuffer = canvas.toBuffer("image/png");

      const { data: { text } } = await Tesseract.recognize(imageBuffer, "eng", {
        logger: () => {}, // suppress logs
      });

      pageTexts.push(text.trim());
      console.log(`OCR: page ${i}/${pageCount} done`);
    } catch (pageErr) {
      console.warn(`OCR failed on page ${i}:`, pageErr.message);
    }
  }

  return pageTexts.join("\n\n");
}

const extractText = async (file) => {
  const extension = path.extname(file.originalname).toLowerCase();

  // TXT Files
  if (extension === ".txt") {
    return fs.readFileSync(file.path, "utf8");
  }

  // PDF Files — try text extraction first, fall back to OCR if scanned
  if (extension === ".pdf") {
    const dataBuffer = fs.readFileSync(file.path);
    const pdfData = await pdf(dataBuffer);
    const extractedText = pdfData.text?.trim() || "";

    if (extractedText.length >= MIN_TEXT_LENGTH) {
      return extractedText;
    }

    // Scanned PDF — run OCR
    console.log(`PDF text too short (${extractedText.length} chars), switching to OCR...`);
    const ocrText = await extractWithOCR(file.path);

    if (!ocrText || ocrText.trim().length < MIN_TEXT_LENGTH) {
      throw new Error(
        "Could not extract readable text from this PDF. The file may be a scanned image with poor quality, password-protected, or corrupted."
      );
    }

    return ocrText;
  }

  // DOCX Files
  if (extension === ".docx") {
    const result = await mammoth.extractRawText({ path: file.path });
    return result.value;
  }

  throw new Error("Unsupported File Type");
};

module.exports = extractText;
