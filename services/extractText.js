const fs = require("fs");
const path = require("path");
const pdf = require("pdf-parse");
const mammoth = require("mammoth");
const Tesseract = require("tesseract.js");

const MIN_TEXT_LENGTH = 50;

// Image extensions that go straight to Gemini Vision (not OCR)
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

const MIME_MAP = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

async function extractWithOCR(fileBuffer) {
  console.log("Scanned PDF detected — running OCR...");

  const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
  const { createCanvas } = require("canvas");

  const data = new Uint8Array(fileBuffer);
  const pdfDoc = await pdfjsLib.getDocument({ data }).promise;
  const pageCount = Math.min(pdfDoc.numPages, 20);
  const truncated = pdfDoc.numPages > 20;

  console.log(`OCR: processing ${pageCount} page(s)...`);
  if (truncated) {
    console.warn(`⚠️  Scanned PDF has ${pdfDoc.numPages} pages — only the first 20 will be OCR'd.`);
  }

  const pageTexts = [];

  for (let i = 1; i <= pageCount; i++) {
    try {
      const page = await pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });

      const canvas = createCanvas(viewport.width, viewport.height);
      const context = canvas.getContext("2d");

      await page.render({ canvasContext: context, viewport }).promise;

      const imageBuffer = canvas.toBuffer("image/png");

      const { data: { text } } = await Tesseract.recognize(imageBuffer, "eng", {
        logger: () => {},
      });

      pageTexts.push(text.trim());
      console.log(`OCR: page ${i}/${pageCount} done`);
    } catch (pageErr) {
      console.warn(`OCR failed on page ${i}:`, pageErr.message);
    }
  }

  const ocrText = pageTexts.join("\n\n");

  if (truncated) {
    return `${ocrText}\n\n[NOTE: This scanned document has ${pdfDoc.numPages} pages. Only the first 20 pages were processed via OCR — content beyond page 20 is not reflected in this summary.]`;
  }

  return ocrText;
}

// Safely get a Buffer regardless of whether multer used memoryStorage or diskStorage
function getBuffer(file) {
  if (file.buffer && file.buffer.length > 0) {
    return file.buffer;
  }
  if (file.path) {
    return fs.readFileSync(file.path);
  }
  throw new Error("File data is unavailable — no buffer or disk path found.");
}

const extractText = async (file) => {
  const extension = path.extname(file.originalname).toLowerCase();

  // ── IMAGE FILES → return base64 + mimeType for Gemini Vision ──
  if (IMAGE_EXTENSIONS.includes(extension)) {
    const mimeType = MIME_MAP[extension] || "image/jpeg";
    const buffer = getBuffer(file);
    const base64Data = buffer.toString("base64");
    return { isImage: true, base64Data, mimeType };
  }

  // ── TXT ──
  if (extension === ".txt") {
    return getBuffer(file).toString("utf8");
  }

  // ── CSV ──
  if (extension === ".csv") {
    return getBuffer(file).toString("utf8");
  }

  // ── PDF — try text extraction first, fall back to OCR ──
  if (extension === ".pdf") {
    const dataBuffer = getBuffer(file);
    const pdfData = await pdf(dataBuffer);
    const extractedText = pdfData.text?.trim() || "";

    if (extractedText.length >= MIN_TEXT_LENGTH) {
      return extractedText;
    }

    console.log(`PDF text too short (${extractedText.length} chars), switching to OCR...`);
    const ocrText = await extractWithOCR(dataBuffer);

    if (!ocrText || ocrText.trim().length < MIN_TEXT_LENGTH) {
      throw new Error(
        "Could not extract readable text from this PDF. The file may be a scanned image with poor quality, password-protected, or corrupted."
      );
    }

    return ocrText;
  }

  // ── DOCX ──
  if (extension === ".docx") {
    const buffer = getBuffer(file);
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  // ── XLSX / XLS ──
  if (extension === ".xlsx" || extension === ".xls") {
    // Lazy-require so the rest of the app isn't affected if xlsx isn't installed
    let XLSX;
    try {
      XLSX = require("xlsx");
    } catch {
      throw new Error(
        "The 'xlsx' package is not installed. Run: npm install xlsx"
      );
    }

    const buffer = getBuffer(file);
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });

    const sheetTexts = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      // Convert to CSV — empty rows filtered out
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false }).trim();
      if (csv) {
        sheetTexts.push(`## Sheet: ${sheetName}\n${csv}`);
      }
    }

    const text = sheetTexts.join("\n\n");
    if (!text.trim()) {
      throw new Error("Could not extract any data from this Excel file. It may be empty.");
    }

    console.log(`📊 Excel extracted: ${workbook.SheetNames.length} sheet(s), ${text.length} chars`);
    return text;
  }

  throw new Error(`Unsupported file type: ${extension}`);
};

// ── Empty-content detection ───────────────────────────────────────────────────
// Returns true when the extracted result carries no meaningful content.
// Works for both plain-text strings and image result objects.
//
// NOTE: Images are never blocked here — a blank/white image still produces
// valid base64 pixel data. The blank-image check happens in summarizeController
// AFTER Gemini Vision returns its description (short response + blank-image
// keywords → reject). We only short-circuit text-based formats here.
function isEmptyContent(extracted) {
  if (!extracted) return true;

  // Image objects always have content (pixel data) — not "empty" at this stage
  if (typeof extracted === "object" && extracted.isImage) return false;

  // Strip whitespace + invisible Unicode (zero-width chars, NBSP, BOM)
  const cleaned = String(extracted)
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "")
    .trim();

  return cleaned.length === 0;
}

module.exports = { extractText, isEmptyContent };