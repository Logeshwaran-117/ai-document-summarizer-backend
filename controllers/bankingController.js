/**
 * bankingController.js  (FIXED v3)
 *
 * Key fix: When a scanned PDF is detected (extractText returns a flag),
 * we send the raw PDF buffer DIRECTLY to Gemini Vision for transaction
 * extraction — bypassing the "OCR text → re-parse" loop that was losing
 * all numeric data.
 *
 * Pipeline:
 *   PDF (scanned) → Gemini Vision → structured JSON transactions  ✅
 *   PDF (digital) → pdf-parse text → AI/regex parse → transactions ✅
 */
const { extractText } = require('../services/extractText');
const { deductTokens } = require('../middleware/planLimit');
const {
  detectDocumentType,
  extractMetadata,
  extractTransactions,
  extractTransactionsFromPdfVision,   // NEW: direct vision path
  categoriseTransactions,
  detectAnomalies,
  generateBankingSummary,
  normaliseDocType,
} = require('../services/bankingAiService');
const { computeAnalytics } = require('../services/bankingAnalytics');
const BankingDocument = require('../models/BankingDocument');

function detectCurrencyFromText(text) {
  const top = text.slice(0, 5000);
  if (/INR|₹|Indian Rupee|Rs\.|Rupee/i.test(top)) return 'INR';
  if (/GBP|£|British Pound/i.test(top)) return 'GBP';
  if (/EUR|€|Euro/i.test(top)) return 'EUR';
  if (/AED|Dirham/i.test(top)) return 'AED';
  if (/SGD|Singapore Dollar/i.test(top)) return 'SGD';
  if (/USD|\$/i.test(top)) return 'USD';
  return null;
}

function cleanNumber(v) {
  if (v == null || v === '' || v === '-' || v === '—') return null;
  if (typeof v === 'number') return isNaN(v) ? null : Math.abs(v);
  let s = String(v)
    .replace(/[₹$£€]|INR|USD|GBP|EUR|AED|SGD/gi, '')
    .replace(/\s+(Dr|CR|Cr|dr)\s*$/i, '')
    .replace(/\(([0-9,.]+)\)/, '$1')
    .replace(/,/g, '')
    .trim();
  const n = parseFloat(s);
  return isNaN(n) ? null : Math.abs(n);
}

function sanitiseTransactions(transactions) {
  const result = [];
  for (const t of transactions) {
    const debit   = cleanNumber(t.debit);
    const credit  = cleanNumber(t.credit);
    const balance = cleanNumber(t.balance);
    const hasAmount   = debit != null || credit != null;
    const hasIdentity = (t.date && t.description && t.description.length > 2);
    if (!hasAmount && !hasIdentity) continue;
    result.push({ ...t, debit, credit, balance });
  }
  console.log(`[banking] sanitiseTransactions: ${transactions.length} raw → ${result.length} kept`);
  return result;
}

async function analyseBankingDocument(req, res) {
  // Token tracking for this session
  let sessionTokens = 0;
  const trackUsage = (usage) => { sessionTokens += (usage?.totalTokenCount || 0); };

  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated.' });

    const isPdf = (req.file.mimetype === 'application/pdf') ||
                  (req.file.originalname || '').toLowerCase().endsWith('.pdf');

    // ── Stage 1: Extract text (with scanned-PDF detection) ───────────────────
    const extracted = await extractText(req.file);

    // extractText returns { isScanned, rawText } for PDFs now
    const isScanned = extracted && extracted.isScanned === true;
    const rawText   = (extracted && typeof extracted.rawText === 'string')
      ? extracted.rawText
      : (typeof extracted === 'string' ? extracted : '');

    if (!rawText || rawText.trim().length < 10) {
      // For scanned PDFs with no text at all, still continue with vision path
      if (!isScanned || !isPdf) {
        return res.status(400).json({ success: false, message: 'Could not extract readable text from this file.' });
      }
    }

    console.log(`[banking] Extracted ${rawText.length} chars, isScanned=${isScanned}`);

    // ── Stage 2: Doc type + metadata ─────────────────────────────────────────
    const textForMeta = rawText.trim().length > 50 ? rawText : '';
    let [documentType, metadata] = await Promise.all([
      detectDocumentType(textForMeta || 'bank statement Indian Bank savings account', trackUsage),
      textForMeta ? extractMetadata(textForMeta, trackUsage) : Promise.resolve({}),
    ]);
    documentType = normaliseDocType(documentType);

    const scannedCurrency = detectCurrencyFromText(rawText);
    const currency = scannedCurrency || metadata.currency || 'INR';
    metadata.currency = currency;
    console.log(`[banking] documentType=${documentType}, currency=${currency}, isScanned=${isScanned}`);

    // ── Stage 3: Extract transactions ─────────────────────────────────────────
    let visionTx = [];
    if (isScanned && isPdf) {
      console.log('[banking] Scanned PDF → trying Gemini Vision direct extraction...');
      try {
        const fileBuffer = req.file.buffer || require('fs').readFileSync(req.file.path);
        const rawVision = await extractTransactionsFromPdfVision(fileBuffer, trackUsage);
        visionTx = sanitiseTransactions(rawVision);
        console.log(`[banking] Vision extraction found ${visionTx.length} transactions`);
      } catch (vErr) {
        console.warn('[banking] Vision extraction failed:', vErr.message);
      }
    }

    let textTx = [];
    if (rawText.trim().length > 100) {
      console.log('[banking] Running text-based AI/Regex extraction...');
      try {
        const rawTextTx = await extractTransactions(rawText, trackUsage);
        textTx = sanitiseTransactions(rawTextTx);
        console.log(`[banking] Text extraction found ${textTx.length} transactions`);
      } catch (tErr) {
        console.warn('[banking] Text extraction failed:', tErr.message);
      }
    }

    // Pick whichever engine extracted MORE transactions!
    if (textTx.length >= visionTx.length) {
      transactions = textTx;
      console.log(`[banking] Selected text-based extraction result (${transactions.length} transactions)`);
    } else {
      transactions = visionTx;
      console.log(`[banking] Selected vision extraction result (${transactions.length} transactions)`);
    }

    // ── Stage 4: Categorise + anomaly detection ───────────────────────────────
    if (transactions.length > 0) {
      transactions = await categoriseTransactions(transactions, trackUsage);
      transactions = await detectAnomalies(transactions, trackUsage);
    }

    // ── Stage 5: Analytics ────────────────────────────────────────────────────
    const analytics = computeAnalytics(transactions, metadata);
    console.log(`[banking] analytics: credits=${analytics.totalCredits}, debits=${analytics.totalDebits}, count=${analytics.transactionCount}`);

    // ── Stage 6: Summary ──────────────────────────────────────────────────────
    const summaryText = rawText.trim().length > 100 ? rawText : JSON.stringify(transactions.slice(0, 10));
    const summary = await generateBankingSummary(summaryText, analytics, documentType, trackUsage);

    // ── Stage 7: Save ─────────────────────────────────────────────────────────
    const doc = await BankingDocument.create({
      userId:        req.user._id,
      filename:      req.file.originalname,
      documentType,
      accountName:   metadata.accountName   || null,
      accountNumber: metadata.accountNumber || null,
      bankName:      metadata.bankName      || null,
      currency,
      periodStart:   metadata.periodStart   || null,
      periodEnd:     metadata.periodEnd     || null,
      extractedText: rawText,
      summary,
      transactions,
      analytics,
    });

    // Deduct tokens consumed by all AI calls in this pipeline
    const tokenStatus = await deductTokens(req.user._id, sessionTokens);

    res.json({
      success: true,
      _id:         doc._id,
      filename:    doc.filename,
      documentType,
      accountName: doc.accountName,
      bankName:    doc.bankName,
      currency,
      periodStart: doc.periodStart,
      periodEnd:   doc.periodEnd,
      summary,
      transactions,
      analytics,
      tokensUsed: sessionTokens,
      tokenStatus,
    });

  } catch (err) {
    console.error('Banking analysis error:', err);
    res.status(500).json({ success: false, message: err.message || 'Analysis failed.' });
  }
}

module.exports = { analyseBankingDocument };