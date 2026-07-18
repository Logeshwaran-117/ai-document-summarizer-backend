/**
 * services/extractText.js  (FIXED v2)
 *
 * Turns an uploaded file (PDF, Word, Excel, CSV, TXT, or image) into plain
 * text so the rest of the pipeline can work on it regardless of source format.
 *
 * KEY FIXES:
 *  1. Scanned/image-based PDFs (like Indian Bank statements) are detected via
 *     a chars-per-page heuristic and fall back to Gemini Vision OCR instead of
 *     returning empty text from pdf-parse.
 *  2. isEmptyContent() is now exported — summarizeController and
 *     tableController both import it from here.
 *
 * Works with either multer memoryStorage (file.buffer) or diskStorage
 * (file.path) — whichever your upload middleware is configured with.
 */
const fs   = require('fs');
const path = require('path');

// ── Helpers ───────────────────────────────────────────────────────────────────

function getBuffer(file) {
  if (file.buffer) return file.buffer;
  if (file.path)   return fs.readFileSync(file.path);
  throw new Error('Uploaded file has neither buffer nor path.');
}

/**
 * Returns true when the extracted content is effectively empty.
 * Handles both plain strings (PDF/text path) and { isImage } objects
 * (image path returned by extractText for image files).
 */
function isEmptyContent(extracted) {
  if (!extracted) return true;
  if (typeof extracted === 'object' && extracted.isImage) {
    // Image objects always have content — let the AI decide if it's blank
    return false;
  }
  // Handle new {rawText, isScanned} PDF object
  if (typeof extracted === 'object' && typeof extracted.rawText === 'string') {
    return extracted.rawText.trim().length < 20;
  }
  return typeof extracted !== 'string' || extracted.trim().length < 20;
}

// ── Scanned-PDF detection ─────────────────────────────────────────────────────

/**
 * If pdf-parse returns very little text per page, the PDF is almost certainly
 * a scanned document (image-based pages with no embedded text layer).
 */
function isScannedPdf(text, pageCount) {
  if (!text || text.trim().length === 0) return true;
  const trimmed = text.trim();
  // If total extracted text is very short regardless of page count, treat as scanned
  if (trimmed.length < 50) return true;
  const avgCharsPerPage = trimmed.length / Math.max(pageCount || 1, 1);
  // Real text PDFs (including table-heavy bank statements): typically 200–3000+ chars/page.
  // Pure image/scanned PDFs with no text layer: < 50 chars/page.
  // Threshold raised from 100 → 50 to avoid falsely OCR-ing digital PDFs with sparse tables.
  return avgCharsPerPage < 50;
}

// ── OCR via Gemini Vision ─────────────────────────────────────────────────────

/**
 * Sends the PDF as a native inline document to Gemini Vision.
 * Gemini can read both digital text AND scanned/image pages natively.
 * Used as the fallback when pdf-parse returns near-empty text.
 */
async function ocrPdfWithGemini(buffer) {
  const { callWithRotation } = require('./geminiService');
  const base64 = buffer.toString('base64');

  console.log('[extractText] Scanned PDF — using Gemini Vision OCR...');

  const parts = [
    {
      inlineData: {
        mimeType: 'application/pdf',
        data: base64,
      },
    },
    {
      text:
        'This document may be a bank statement, invoice, receipt, or any financial/text document. ' +
        'Transcribe ALL text from every page exactly as it appears. ' +
        'For bank statement transaction tables, keep each row on one line in this order: ' +
        'DATE  DESCRIPTION  DEBIT_AMOUNT_OR_DASH  CREDIT_AMOUNT_OR_DASH  BALANCE\n' +
        'Preserve all currency amounts exactly (e.g. "INR 2,779.00", "USD 1,234.56"). ' +
        'Include headers, account details, summaries, and every transaction row. ' +
        'Return only the transcribed text — no commentary, no markdown.',
    },
  ];

  const text = await callWithRotation(() => parts, 8192);
  console.log(`[extractText] Gemini Vision OCR returned ${text?.length || 0} chars`);
  return text || '';
}

// ── Per-format extractors ─────────────────────────────────────────────────────

async function extractFromPdf(buffer) {
  const pdfParse = require('pdf-parse');

  let pdfText  = '';
  let pageCount = 1;

  try {
    const data = await pdfParse(buffer);
    pdfText   = data.text    || '';
    pageCount = data.numpages || 1;
  } catch (err) {
    console.warn('[extractText] pdf-parse failed:', err.message);
  }

  // If pdf-parse got a good text layer, use it directly
  if (!isScannedPdf(pdfText, pageCount)) {
    console.log(`[extractText] pdf-parse OK — ${pdfText.length} chars from ${pageCount} pages`);
    // Return structured object so bankingController can detect isScanned=false
    return { rawText: pdfText, isScanned: false };
  }

  // Scanned or empty — fall back to Gemini Vision OCR
  console.log(`[extractText] Scanned PDF (${pdfText.trim().length} chars / ${pageCount} pages) — falling back to Gemini Vision`);
  const ocrText = await ocrPdfWithGemini(buffer);
  return { rawText: ocrText, isScanned: true };
}

async function extractFromDocx(buffer) {
  const mammoth = require('mammoth');
  const { value } = await mammoth.extractRawText({ buffer });
  return value || '';
}

async function extractFromExcel(buffer) {
  const XLSX = require('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  let out = '';
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    out += `--- Sheet: ${sheetName} ---\n${XLSX.utils.sheet_to_csv(sheet)}\n\n`;
  }
  return out;
}

/**
 * For image files we return a structured object instead of a plain string.
 * summarizeController checks extracted.isImage to pick the Vision path;
 * tableController does the same via extractTableFromImage.
 */
async function extractFromImage(buffer, mimeType) {
  const base64Data = buffer.toString('base64');
  // Return a special object so controllers know to use the Vision pipeline
  return { isImage: true, base64Data, mimeType };
}

function extractFromPlainText(buffer) {
  return buffer.toString('utf-8');
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * @param  {Express.Multer.File} file
 * @returns {Promise<string | { isImage: true, base64Data: string, mimeType: string }>}
 */
async function extractText(file) {
  const ext  = path.extname(file.originalname || '').toLowerCase();
  const mime = file.mimetype || '';
  const buf  = getBuffer(file);

  if (ext === '.pdf' || mime === 'application/pdf') {
    return extractFromPdf(buf);
  }

  if (
    ext === '.docx' || ext === '.doc' ||
    mime.includes('wordprocessingml') || mime === 'application/msword'
  ) {
    return extractFromDocx(buf);
  }

  if (
    ext === '.xlsx' || ext === '.xls' ||
    mime.includes('spreadsheetml') || mime === 'application/vnd.ms-excel'
  ) {
    return extractFromExcel(buf);
  }

  if (ext === '.csv' || mime === 'text/csv')   return extractFromPlainText(buf);
  if (ext === '.txt' || mime === 'text/plain') return extractFromPlainText(buf);

  if (
    ['.png', '.jpg', '.jpeg', '.webp'].includes(ext) ||
    mime.startsWith('image/')
  ) {
    return extractFromImage(buf, mime || `image/${ext.slice(1)}`);
  }

  throw new Error(`Unsupported file type: ${ext || mime}`);
}

module.exports = { extractText, isEmptyContent };