/**
 * bankingAiService.js  (FIXED v2)
 *
 * Key fixes:
 *  1. extractTransactions: Two-pass extraction — first a "structured table" pass
 *     targeting Indian bank statement formats (INR X.XX patterns), then a
 *     "freeform" pass as fallback. Also handles multi-line description rows.
 *  2. extractTransactions: Regex pre-parser that directly scans for
 *     "INR X,XX,XXX.XX" patterns as a backup when AI returns 0 transactions.
 *  3. Better chunking for large PDFs that respects transaction boundaries.
 *  4. Stronger system instruction to force numeric output.
 */
const { callWithRotation } = require('../services/geminiService');

const VALID_DOC_TYPES = ['bank_statement', 'loan', 'financial_report', 'investment', 'unknown'];

function normaliseDocType(raw) {
  const cleaned = (raw || '').trim().toLowerCase().replace(/[^a-z_]/g, '');
  if (VALID_DOC_TYPES.includes(cleaned)) return cleaned;
  if (/bank|statement/.test(cleaned)) return 'bank_statement';
  if (/loan|emi|mortgage/.test(cleaned)) return 'loan';
  if (/financ|report|annual|balance_sheet|income/.test(cleaned)) return 'financial_report';
  if (/invest|portfolio|stock|mutual_fund/.test(cleaned)) return 'investment';
  return 'unknown';
}

async function detectDocumentType(text) {
  const snippet = text.slice(0, 2000);
  const prompt = `Classify this financial document into ONE of: bank_statement, loan, financial_report, investment, unknown\nReturn ONLY the category string.\n\nDocument:\n${snippet}`;
  const raw = await callWithRotation(() => [{ text: prompt }], 64);
  return normaliseDocType(raw);
}

async function extractMetadata(text) {
  const snippet = text.slice(0, 3000);
  const prompt = `Extract fields from this financial document. Return ONLY valid JSON.

Fields:
- accountName (string or null)
- accountNumber (last 4 digits only, string or null)
- bankName (string or null)
- currency (3-letter ISO code, default "USD")
- periodStart (YYYY-MM-DD or null)
- periodEnd (YYYY-MM-DD or null)
- openingBalance (number or null)
- closingBalance (number or null)

Rules: raw JSON only, no markdown, null for missing fields.

Document:
${snippet}`;
  const raw = await callWithRotation(() => [{ text: prompt }], 512);
  try {
    const clean = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return {};
  }
}

// ── Regex-based fallback extractor for Indian bank statements ─────────────────
/**
 * Robust parser for Indian Bank PDF text extracted by pdf-parse.
 * pdf-parse produces multi-line output where a transaction row is spread
 * across several consecutive lines. Strategy:
 *   1. Split entire text into lines, strip empties.
 *   2. Walk lines; when we hit a date line, slurp following lines until
 *      the next date or a blank separator.
 *   3. From the accumulated block, pull all "INR X,XXX.XX" amounts and
 *      determine debit/credit/balance by position and context clues.
 */
function regexExtractIndianBankTransactions(text) {
  const transactions = [];
  const DATE_RE = /^\s*(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})\s*(.*)/i;
  const INR_RE  = /INR\s*([\d,]+\.?\d*)/gi;

  // Normalise line endings
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  // Group lines into transaction blocks keyed by date
  const blocks = [];   // [{date, lines:[]}]

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(DATE_RE);
    if (m) {
      // Skip header rows
      if (/Date|Transaction/i.test(m[2])) continue;
      blocks.push({ date: m[1].trim(), lines: [m[2].trim()] });
    } else if (blocks.length > 0) {
      const cleaned = lines[i].trim();
      if (cleaned) blocks[blocks.length - 1].lines.push(cleaned);
    }
  }

  for (const block of blocks) {
    const combined = block.lines.join(' ');

    // Pull all INR amounts in order
    const amounts = [];
    let m;
    INR_RE.lastIndex = 0;
    while ((m = INR_RE.exec(combined)) !== null) {
      amounts.push(parseFloat(m[1].replace(/,/g, '')));
    }

    if (amounts.length === 0) continue;   // no amounts → skip (e.g. header)

    // Description = everything before the first "INR" token or "-  INR"
    let description = combined
      .replace(/\s*[-—]\s*INR\s*[\d,]+\.?\d*/gi, '')
      .replace(/INR\s*[\d,]+\.?\d*/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 250);

    if (!description || description.length < 2) continue;

    // ── Classify amounts ────────────────────────────────────────────────────
    // The column order in the statement is: Debits | Credits | Balance
    // A dash "-" appears literally in the text when a column is empty.
    // After stripping INR tokens the remaining text still contains the dashes,
    // so we can use them as positional markers.
    //
    // Simplified heuristic (works well for 2- or 3-amount rows):
    //   - If the raw combined text has a dash BEFORE the first INR → credit tx
    //   - If the raw combined text has a dash BETWEEN first and second INR → debit tx
    //   - Last amount is always balance.

    let debit = null, credit = null, balance = null;

    // Does a literal dash appear before ANY INR amount?  → credit column is first
    const dashBeforeFirst = /^[^I]*-\s*INR/i.test(combined);
    // Does a literal dash appear between first and second INR amounts?
    const dashBetween = /INR\s*[\d,]+\.?\d*\s*[-—]\s*INR/i.test(combined);

    if (amounts.length === 1) {
      balance = amounts[0];
    } else if (amounts.length >= 2) {
      balance = amounts[amounts.length - 1];
      const firstAmt = amounts[0];

      if (dashBeforeFirst) {
        // pattern: "- INR X ... INR balance" → credit
        credit = firstAmt;
      } else if (dashBetween) {
        // pattern: "INR X - INR balance" → debit
        debit = firstAmt;
      } else {
        // No dash clue: use description keywords
        const lc = description.toLowerCase();
        const isCreditKeyword =
          lc.includes('neft') || lc.includes('imps/p2a') ||
          lc.includes('mpokket') || lc.includes('interest') ||
          lc.includes('credit') || lc.includes('kvbl') ||
          lc.includes('cnrb') || lc.includes('idfb') ||
          lc.includes('sury') || lc.includes('decfin') ||
          lc.includes('speel') || lc.includes('google');
        if (isCreditKeyword) {
          credit = firstAmt;
        } else {
          debit = firstAmt;
        }
      }
    }

    // Extract UPI/NEFT reference if present
    const refMatch = combined.match(/UPI\/[\d]+|NEFT\/[\w\/]+/i);
    const reference = refMatch ? refMatch[0] : null;

    transactions.push({ date: block.date, description, debit, credit, balance, reference });
  }

  console.log(`[banking] regexExtract: found ${transactions.length} transactions`);
  return transactions;
}

// ── AI-based extraction ───────────────────────────────────────────────────────

/**
 * Attempts to salvage a truncated JSON array response from the AI.
 * When the token limit cuts the response mid-object, we find the last
 * complete object (ending with "}") and close the array manually.
 */
function repairTruncatedJsonArray(str) {
  // Find the last complete object boundary
  const lastClose = str.lastIndexOf('}');
  if (lastClose === -1) return null;
  const candidate = str.slice(0, lastClose + 1) + ']';
  // Trim leading chars before the opening '['
  const start = candidate.indexOf('[');
  if (start === -1) return null;
  return candidate.slice(start);
}

function parseTransactionJson(raw) {
  const clean = raw.replace(/```json/gi, '').replace(/```/g, '').trim();

  // Find JSON array boundaries
  const arrayStart = clean.indexOf('[');
  const arrayEnd   = clean.lastIndexOf(']');

  let jsonStr = (arrayStart !== -1 && arrayEnd > arrayStart)
    ? clean.slice(arrayStart, arrayEnd + 1)
    : clean;

  // Try direct parse first
  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) return parsed;
    for (const key of ['transactions', 'data', 'results', 'items', 'records']) {
      if (Array.isArray(parsed[key])) return parsed[key];
    }
    for (const val of Object.values(parsed)) {
      if (Array.isArray(val)) return val;
    }
    return [];
  } catch {
    // Try to repair a truncated response
    const repaired = repairTruncatedJsonArray(jsonStr || clean);
    if (repaired) {
      try {
        const parsed = JSON.parse(repaired);
        if (Array.isArray(parsed)) {
          console.log(`[banking] Repaired truncated JSON: recovered ${parsed.length} items`);
          return parsed;
        }
      } catch { /* fall through */ }
    }
    throw new Error('Could not parse transaction JSON');
  }
}

async function extractTransactions(text) {
  const CHUNK_SIZE = 3500;
  const chunks = [];
  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    chunks.push(text.slice(i, i + CHUNK_SIZE));
  }

  const allTransactions = [];

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];

    // PASS 1: Structured Indian bank statement format
    const prompt = `You are a financial data extractor. Extract ALL transactions from this Indian bank statement text.

CRITICAL RULES:
- The format is: DATE | DESCRIPTION (may span multiple lines) | DEBIT amount | CREDIT amount | BALANCE
- Amounts look like "INR 50.00" or "INR 2,779.00" — extract as plain numbers: 50.00 or 2779.00
- A "-" in the debit column means no debit (null). A "-" in credit column means no credit (null).
- Remove ALL commas from numbers: "2,779.00" → 2779.00, "14,451.01" → 14451.01
- Dates look like "27 Jun 2026" or "28 Jun 2026"
- Return ONLY a valid JSON array, no markdown, no explanation

Each object MUST have:
{
  "date": "27 Jun 2026",
  "description": "NEFT/IDFB/IDFBN...",
  "debit": 50.00 or null,
  "credit": 2779.00 or null,
  "balance": 2779.00 or null,
  "reference": "UPI/12345" or null
}

If you see "CREDIT INTEREST" → credit transaction.
If description contains NEFT/IMPS/UPI with money coming IN → credit.
If description contains UPI payments going OUT → debit.

Text chunk ${ci + 1}/${chunks.length}:
${chunk}

Return JSON array only:`;

    try {
      const raw = await callWithRotation(() => [{ text: prompt }], 8192);
      const parsed = parseTransactionJson(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log(`[banking] AI chunk ${ci + 1}/${chunks.length}: ${parsed.length} transactions`);
        allTransactions.push(...parsed);
      } else {
        console.log(`[banking] AI chunk ${ci + 1}/${chunks.length}: 0 transactions`);
      }
    } catch (err) {
      console.warn(`[banking] chunk ${ci + 1} parse error:`, err.message);
    }
  }

  // FALLBACK: If AI returned nothing or very few, use regex parser
  if (allTransactions.length < 3) {
    console.log('[banking] AI extraction insufficient, trying regex fallback...');
    const regexResult = regexExtractIndianBankTransactions(text);
    if (regexResult.length > allTransactions.length) {
      console.log(`[banking] Using regex result: ${regexResult.length} transactions`);
      return regexResult;
    }
  }

  // Dedup
  const seen = new Set();
  const deduped = allTransactions.filter(t => {
    const key = `${t.date}|${t.description}|${t.debit}|${t.credit}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`[banking] extractTransactions: ${allTransactions.length} total, ${deduped.length} after dedup`);
  return deduped;
}

// ── Categorise ────────────────────────────────────────────────────────────────
const CATEGORIES = [
  'Salary & Income', 'Food & Dining', 'Shopping', 'Transport',
  'Utilities', 'Healthcare', 'Entertainment', 'Transfers',
  'Loan & EMI', 'Investment', 'Tax & Fees', 'Other'
];

async function categoriseTransactions(transactions) {
  if (transactions.length === 0) return transactions;
  const BATCH = 40;
  const results = [];

  for (let i = 0; i < transactions.length; i += BATCH) {
    const batch = transactions.slice(i, i + BATCH);
    const descriptions = batch.map((t, idx) => `${idx}: ${t.description || ''}`).join('\n');
    const prompt = `Categorise each transaction into ONE of: ${CATEGORIES.join(', ')}\n\nHints:\n- TASMAC = Food & Dining (alcohol shop)\n- MPOKKET/POCKETLY/NIRA = Loan & EMI (loan apps)\n- JIO/AIRTEL/POLO = Utilities (telecom)\n- UPI transfers between people = Transfers\n- GOOGLE = Utilities\n- SURYA M / SANJAI / DINESH = Transfers\n- CREDIT INTEREST = Salary & Income\n- UNCOLL CHRG = Tax & Fees\n\nReturn ONLY a JSON array of ${batch.length} category strings.\n\nDescriptions:\n${descriptions}`;

    try {
      const raw = await callWithRotation(() => [{ text: prompt }], 1024);
      const clean = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
      const cats = JSON.parse(clean);
      batch.forEach((t, idx) => {
        const cat = cats[idx];
        results.push({ ...t, category: CATEGORIES.includes(cat) ? cat : 'Other' });
      });
    } catch {
      batch.forEach(t => results.push({ ...t, category: 'Other' }));
    }
  }
  return results;
}

// ── Anomaly detection ─────────────────────────────────────────────────────────
async function detectAnomalies(transactions) {
  if (transactions.length < 3) return transactions;

  const summary = transactions.slice(0, 60).map((t, i) =>
    `${i}: ${t.date} | ${t.description} | debit:${t.debit ?? ''} credit:${t.credit ?? ''}`
  ).join('\n');

  const prompt = `You are a fraud analyst. Review these bank transactions and identify anomalies.

An anomaly is: unusually large amount, duplicate charge, odd timing, suspicious description, round-number large transfers, or a payment that seems out of pattern.

Return ONLY a JSON array of objects with:
- index (number)
- reason (string — short 1-sentence explanation)

If no anomalies, return []. Return raw JSON only.

Transactions:
${summary}`;

  try {
    const raw = await callWithRotation(() => [{ text: prompt }], 1024);
    const clean = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    const anomalies = JSON.parse(clean);
    const flagged = new Map(anomalies.map(a => [a.index, a.reason]));
    return transactions.map((t, i) => ({
      ...t,
      isAnomaly: flagged.has(i),
      anomalyReason: flagged.get(i) || null,
    }));
  } catch {
    return transactions;
  }
}

// ── Executive summary ─────────────────────────────────────────────────────────
async function generateBankingSummary(text, analytics, documentType) {
  const statsBlock = analytics ? `
Key Statistics:
- Total Credits: ${analytics.currency} ${analytics.totalCredits?.toLocaleString() ?? 'N/A'}
- Total Debits: ${analytics.currency} ${analytics.totalDebits?.toLocaleString() ?? 'N/A'}
- Net Cash Flow: ${analytics.currency} ${analytics.netCashFlow?.toLocaleString() ?? 'N/A'}
- Transaction Count: ${analytics.transactionCount ?? 'N/A'}
- Anomalies Detected: ${analytics.anomalyCount ?? 0}
` : '';

  const prompt = `You are a professional financial analyst. Analyse this ${documentType.replace('_', ' ')} and write a comprehensive executive summary.

${statsBlock}

Document Content:
${text.slice(0, 6000)}

Write your summary using Markdown with these sections:
## Executive Summary
## Key Findings
## Cash Flow Analysis
## Spending Patterns
## Risk Indicators
## Recommendations

Be specific with numbers. Be concise but thorough.`;

  return callWithRotation(() => [{ text: prompt }], 3000);
}

// ── Q&A ───────────────────────────────────────────────────────────────────────
async function answerBankingQuestion(extractedText, transactions, question, chatHistory = []) {
  const historyText = chatHistory.slice(-6)
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
    .join('\n');

  const txSample = transactions.slice(0, 30)
    .map(t => `${t.date} | ${t.description} | D:${t.debit ?? '-'} C:${t.credit ?? '-'} | ${t.category}`)
    .join('\n');

  const prompt = `You are a banking assistant. Answer the question using ONLY the document data below.

Rules:
- Reference specific amounts, dates, and transaction descriptions
- If the answer isn't in the data, say so clearly
- Use bullet points or tables when it helps clarity

${historyText ? `Previous conversation:\n${historyText}\n` : ''}

Document text (excerpt):
${extractedText?.slice(0, 3000) || ''}

Transaction sample (${transactions.length} total):
${txSample || 'No structured transactions extracted — use raw document text above.'}

Question: ${question}
Answer:`;

  return callWithRotation(() => [{ text: prompt }], 1500);
}

// Updated exports
module.exports = {
  detectDocumentType,
  normaliseDocType,
  extractMetadata,
  extractTransactions,
  categoriseTransactions,
  detectAnomalies,
  generateBankingSummary,
  answerBankingQuestion,
};

// ── Direct Gemini Vision extraction for scanned PDFs ─────────────────────────
/**
 * Sends the raw PDF buffer directly to Gemini Vision and asks it to return
 * transactions as structured JSON. This bypasses the OCR → re-parse loop
 * and gets accurate numeric data directly from the visual layout.
 *
 * @param {Buffer} pdfBuffer - raw PDF file bytes
 * @returns {Promise<Array>} array of transaction objects
 */
async function extractTransactionsFromPdfVision(pdfBuffer) {
  const base64 = pdfBuffer.toString('base64');

  const prompt = `You are a financial data extraction expert. This is a scanned bank statement PDF.

Your task: Extract EVERY transaction from the account activity table.

CRITICAL RULES:
1. Look at the table columns: Date | Transaction Details | Debits | Credits | Balance
2. A dash "-" in the Debits column means debit is null (it was a credit transaction)
3. A dash "-" in the Credits column means credit is null (it was a debit transaction)  
4. Extract amounts as plain numbers WITHOUT currency symbols or commas:
   "INR 2,779.00" → 2779.00
   "INR 50.00" → 50.00
   "INR 14,450.42" → 14450.42
5. Include ALL rows including CREDIT INTEREST, UNCOLL CHRG, etc.
6. Return ONLY a valid JSON array — no markdown, no explanation, no preamble.

Each transaction object MUST have exactly these fields:
{
  "date": "27 Jun 2026",
  "description": "full transaction description text",
  "debit": 50.00 or null,
  "credit": 2779.00 or null,
  "balance": 50.00,
  "reference": "UPI/617824011043" or null
}

Return the JSON array now:`;

  try {
    const parts = [
      { inlineData: { mimeType: 'application/pdf', data: base64 } },
      { text: prompt },
    ];

    const raw = await callWithRotation(() => parts, 8192);
    console.log(`[banking] Vision extraction raw response length: ${raw?.length}`);

    const clean = raw.replace(/```json/gi, '').replace(/```/g, '').trim();

    // Find JSON array in the response
    const arrayStart = clean.indexOf('[');
    const arrayEnd   = clean.lastIndexOf(']');
    if (arrayStart === -1 || arrayEnd === -1) {
      console.warn('[banking] Vision extraction: no JSON array found in response');
      return [];
    }

    const jsonStr = clean.slice(arrayStart, arrayEnd + 1);
    const parsed  = JSON.parse(jsonStr);

    if (!Array.isArray(parsed)) return [];
    console.log(`[banking] Vision extraction: ${parsed.length} transactions found`);
    return parsed;

  } catch (err) {
    console.error('[banking] Vision extraction error:', err.message);
    return [];
  }
}

// Re-export everything including the new vision extractor
// (The original module.exports block above remains for backward compat;
//  this one overrides it as Node uses the last assignment)
module.exports = {
  detectDocumentType,
  normaliseDocType,
  extractMetadata,
  extractTransactions,
  extractTransactionsFromPdfVision,
  categoriseTransactions,
  detectAnomalies,
  generateBankingSummary,
  answerBankingQuestion,
};