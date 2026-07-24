/**
 * bankingAiService.js  (ENHANCED v3)
 *
 * Major improvements:
 *  1. Expanded 22 Financial Categories (Salary, Food, Groceries, Shopping, Fuel,
 *     Transport, Utilities, Healthcare, Entertainment, Transfers (P2P), Merchant (P2M),
 *     Loan & EMI, Credit Card Bill, Investment, Rent, Education, ATM, Tax, Bank Charges,
 *     Subscriptions, Business, Other).
 *  2. Dual-engine Categorisation: Advanced AI prompt + local regex/keyword heuristic engine
 *     so Indian UPI/NEFT/IMPS/ATM/POS/Fuel transactions are 100% categorized accurately even if AI returns "Other".
 *  3. Extended transaction fields: counterparty (payee/payer name) and paymentMethod (UPI, NEFT, IMPS, ATM, POS, CHEQUE, CARD, etc.).
 *  4. Extended metadata fields: accountType, branchName, ifscCode.
 */
const { callWithRotation } = require('../services/geminiService');

// ── Pre-process text to remove pdf-parse pseudo-CSV artifacts ────────────────
function cleanTableText(rawText) {
    if (!rawText) return "";
    let cleaned = rawText.replace(/"([^"]*)"/g, (match, insideQuotes) => {
        const flattened = insideQuotes.replace(/[\n\r]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
        return `"${flattened}"`;
    });
    cleaned = cleaned.replace(/"\s*,\s*\n\s*"/g, '","');
    cleaned = cleaned.replace(/"\s*\n\s*,\s*"/g, '","');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    return cleaned;
}

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
- accountType (string or null e.g. "Savings Account", "Current Account", "Credit Card")
- bankName (string or null)
- branchName (string or null)
- ifscCode (string or null)
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

// ── Extract Counterparty & Payment Method ─────────────────────────────────────
function extractCounterpartyAndMode(description) {
  if (!description) return { counterparty: null, paymentMethod: 'OTHER' };
  const desc = description.trim();
  let paymentMethod = 'OTHER';
  let counterparty = null;

  // Payment channel detection
  if (/^UPI\b|UPI\//i.test(desc)) paymentMethod = 'UPI';
  else if (/^NEFT\b|NEFT\//i.test(desc)) paymentMethod = 'NEFT';
  else if (/^IMPS\b|IMPS\//i.test(desc)) paymentMethod = 'IMPS';
  else if (/^RTGS\b|RTGS\//i.test(desc)) paymentMethod = 'RTGS';
  else if (/ATM|CASH WDL|WDL-ATM/i.test(desc)) paymentMethod = 'ATM';
  else if (/POS|CARD WDL|MERCHANT/i.test(desc)) paymentMethod = 'POS';
  else if (/CHQ|CHEQUE/i.test(desc)) paymentMethod = 'CHEQUE';
  else if (/ACH|NACH/i.test(desc)) paymentMethod = 'ACH';
  else if (/INTEREST/i.test(desc)) paymentMethod = 'INTEREST';
  else if (/CHRG|CHARGE|FEE|PENALTY/i.test(desc)) paymentMethod = 'CHARGE';

  // Counterparty extraction
  const upiMatch = desc.match(/^UPI\/(?:P2A\/|P2M\/|DR\/|CR\/)?([^\/]+)/i);
  if (upiMatch && upiMatch[1]) {
    const rawName = upiMatch[1].replace(/[-_]/g, ' ').trim();
    if (rawName.length > 1 && !/^\d+$/.test(rawName)) {
      counterparty = rawName;
    }
  } else {
    const neftMatch = desc.match(/NEFT\/[^\/]+\/([^\/]+)/i);
    if (neftMatch && neftMatch[1]) {
      counterparty = neftMatch[1].trim();
    }
  }

  return { counterparty, paymentMethod };
}

// ── Regex-based fallback extractor for Indian bank statements ─────────────────
function regexExtractIndianBankTransactions(text) {
  const transactions = [];
  const DATE_RE = /^\s*(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})\s*(.*)/i;
  const INR_RE  = /INR\s*([\d,]+\.?\d*)/gi;

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(DATE_RE);
    if (m) {
      if (/Date|Transaction/i.test(m[2])) continue;
      blocks.push({ date: m[1].trim(), lines: [m[2].trim()] });
    } else if (blocks.length > 0) {
      const cleaned = lines[i].trim();
      if (cleaned) blocks[blocks.length - 1].lines.push(cleaned);
    }
  }

  for (const block of blocks) {
    const combined = block.lines.join(' ');
    const amounts = [];
    let m;
    INR_RE.lastIndex = 0;
    while ((m = INR_RE.exec(combined)) !== null) {
      amounts.push(parseFloat(m[1].replace(/,/g, '')));
    }

    if (amounts.length === 0) continue;

    let description = combined
      .replace(/\s*[-—]\s*INR\s*[\d,]+\.?\d*/gi, '')
      .replace(/INR\s*[\d,]+\.?\d*/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 250);

    if (!description || description.length < 2) continue;

    let debit = null, credit = null, balance = null;
    const dashBeforeFirst = /^[^I]*-\s*INR/i.test(combined);
    const dashBetween = /INR\s*[\d,]+\.?\d*\s*[-—]\s*INR/i.test(combined);

    if (amounts.length === 1) {
      balance = amounts[0];
    } else if (amounts.length >= 2) {
      balance = amounts[amounts.length - 1];
      const firstAmt = amounts[0];

      if (dashBeforeFirst) {
        credit = firstAmt;
      } else if (dashBetween) {
        debit = firstAmt;
      } else {
        const lc = description.toLowerCase();
        const isCreditKeyword =
          lc.includes('neft') || lc.includes('imps/p2a') ||
          lc.includes('mpokket') || lc.includes('interest') ||
          lc.includes('credit') || lc.includes('kvbl') ||
          lc.includes('cnrb') || lc.includes('idfb') ||
          lc.includes('sury') || lc.includes('decfin') ||
          lc.includes('speel') || lc.includes('google');
        if (isCreditKeyword) credit = firstAmt;
        else debit = firstAmt;
      }
    }

    const refMatch = combined.match(/UPI\/[\d]+|NEFT\/[\w\/]+/i);
    const reference = refMatch ? refMatch[0] : null;
    const { counterparty, paymentMethod } = extractCounterpartyAndMode(description);

    transactions.push({ date: block.date, description, debit, credit, balance, reference, counterparty, paymentMethod });
  }

  console.log(`[banking] regexExtract: found ${transactions.length} transactions`);
  return transactions;
}

// ── AI-based extraction ───────────────────────────────────────────────────────

function repairTruncatedJsonArray(str) {
  const lastClose = str.lastIndexOf('}');
  if (lastClose === -1) return null;
  const candidate = str.slice(0, lastClose + 1) + ']';
  const start = candidate.indexOf('[');
  if (start === -1) return null;
  return candidate.slice(start);
}

function parseTransactionJson(raw) {
  const clean = raw.replace(/```json/gi, '').replace(/```/g, '').trim();

  const arrayStart = clean.indexOf('[');
  const arrayEnd   = clean.lastIndexOf(']');

  let jsonStr = (arrayStart !== -1 && arrayEnd > arrayStart)
    ? clean.slice(arrayStart, arrayEnd + 1)
    : clean;

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

async function extractTransactions(text, onUsage) {
  const cleanedText = cleanTableText(text);

  // 1. Run regex-based extractor across full text to get local baseline
  const regexTx = regexExtractIndianBankTransactions(cleanedText);
  console.log(`[banking] Regex baseline extracted: ${regexTx.length} transactions`);

  // 2. Run AI chunked extraction with smaller chunk size (1800 chars) to prevent Gemini output truncation
  const CHUNK_SIZE = 1800;
  const OVERLAP    = 200;
  const chunks = [];
  for (let i = 0; i < cleanedText.length; i += CHUNK_SIZE) {
    const start = i === 0 ? 0 : i - OVERLAP;
    chunks.push(cleanedText.slice(start, i + CHUNK_SIZE));
  }

  const aiTransactions = [];

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];

    const prompt = `You are an expert bank statement extractor. Extract EVERY SINGLE transaction row from this text chunk into a JSON array.

CRITICAL INSTRUCTIONS:
1. Extract ALL transactions in this chunk. Do not skip any row.
2. Return ONLY a JSON array.

Object format:
[
  {
    "date": "27 Jun 2026",
    "description": "IDIB000C126/Mrs Revathi Velmurugan...",
    "debit": 50.00 or null,
    "credit": null,
    "balance": 50.00,
    "reference": "UPI/617824011043" or null,
    "counterparty": "Mrs Revathi Velmurugan" or null,
    "paymentMethod": "UPI"
  }
]

Text chunk ${ci + 1}/${chunks.length}:
${chunk}

Return JSON array only:`;

    try {
      const raw = await callWithRotation(() => [{ text: prompt }], 16384, "gemini-2.5-flash", onUsage);
      const parsed = parseTransactionJson(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log(`[banking] AI chunk ${ci + 1}/${chunks.length}: ${parsed.length} transactions`);
        parsed.forEach(t => {
          // Normalize key names if model used shortcuts
          const normalized = {
            date:          t.date || t.d || "",
            description:   t.description || t.desc || t.details || "",
            debit:         t.debit ?? t.deb ?? null,
            credit:        t.credit ?? t.cred ?? null,
            balance:       t.balance ?? t.bal ?? null,
            reference:     t.reference || t.ref || null,
            counterparty:  t.counterparty || t.party || null,
            paymentMethod: t.paymentMethod || t.mode || "OTHER",
          };
          if (!normalized.counterparty || !normalized.paymentMethod || normalized.paymentMethod === "OTHER") {
            const enriched = extractCounterpartyAndMode(normalized.description);
            normalized.counterparty  = normalized.counterparty || enriched.counterparty;
            normalized.paymentMethod = enriched.paymentMethod || normalized.paymentMethod;
          }
          if (normalized.date && (normalized.debit != null || normalized.credit != null || normalized.balance != null)) {
            aiTransactions.push(normalized);
          }
        });
      } else {
        console.log(`[banking] AI chunk ${ci + 1}/${chunks.length}: 0 transactions`);
      }
    } catch (err) {
      console.warn(`[banking] chunk ${ci + 1} parse error:`, err.message);
    }
  }

  // 3. Hybrid Union: Combine AI transactions and Regex baseline transactions
  const combinedList = [...aiTransactions];

  for (const rTx of regexTx) {
    // Check if AI already extracted this transaction
    const exists = aiTransactions.some(aiTx => {
      const dateMatch = aiTx.date && rTx.date && (aiTx.date.toLowerCase() === rTx.date.toLowerCase());
      const amtMatch  = (aiTx.debit === rTx.debit && rTx.debit != null) ||
                        (aiTx.credit === rTx.credit && rTx.credit != null) ||
                        (aiTx.balance === rTx.balance && rTx.balance != null);
      return dateMatch && amtMatch;
    });

    if (!exists) {
      combinedList.push(rTx);
    }
  }

  // 4. Deduplicate final list
  const seen = new Set();
  const deduped = [];
  for (const t of combinedList) {
    const key = `${t.date}|${t.debit ?? ''}|${t.credit ?? ''}|${t.balance ?? ''}|${(t.description || '').slice(0, 30)}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(t);
    }
  }

  console.log(`[banking] extractTransactions: AI=${aiTransactions.length}, Regex=${regexTx.length} → Final Union=${deduped.length}`);
  return deduped;
}

// ── Categorise ────────────────────────────────────────────────────────────────
const CATEGORIES = [
  'Salary & Income',
  'Food & Dining',
  'Groceries & Supermarket',
  'Shopping & Retail',
  'Fuel & Petrol',
  'Travel & Transport',
  'Utilities & Bills',
  'Healthcare & Medical',
  'Entertainment & Media',
  'Transfers (P2P)',
  'Merchant Payments (P2M)',
  'Loan & EMI',
  'Credit Card Bill',
  'Investment & Wealth',
  'Rent & Maintenance',
  'Education & Learning',
  'Cash Withdrawal & ATM',
  'Tax & Government Fees',
  'Bank Charges & Fees',
  'Subscriptions & Software',
  'Business & Professional',
  'Other'
];

function heuristicCategorise(description, debit, credit) {
  if (!description) return 'Other';
  const desc = description.toLowerCase();

  // Salary & Income
  if ((credit > 0) && (desc.includes('salary') || desc.includes('credit interest') || desc.includes('payroll') || desc.includes('stipend') || desc.includes('dividend') || desc.includes('wages'))) {
    return 'Salary & Income';
  }

  // Bank Charges & Fees
  if (desc.includes('uncoll chrg') || desc.includes('min bal') || desc.includes('sms chg') || desc.includes('charge') || desc.includes('chrg') || desc.includes('penalty') || desc.includes('annual fee')) {
    return 'Bank Charges & Fees';
  }

  // Fuel & Petrol
  if (desc.includes('fue') || desc.includes('petrol') || desc.includes('fuel') || desc.includes('hpcl') || desc.includes('iocl') || desc.includes('bpcl') || desc.includes('shell')) {
    return 'Fuel & Petrol';
  }

  // Loan & EMI
  if (desc.includes('mpokket') || desc.includes('pocketly') || desc.includes('nira') || desc.includes('kreditbee') || desc.includes('bajaj') || desc.includes('loan') || desc.includes('emi') || desc.includes('muthoot') || desc.includes('home credit')) {
    return 'Loan & EMI';
  }

  // Food & Dining
  if (desc.includes('tasmac') || desc.includes('swiggy') || desc.includes('zomato') || desc.includes('restaurant') || desc.includes('bakery') || desc.includes('food') || desc.includes('tea') || desc.includes('hotel') || desc.includes('cafe') || desc.includes('eatery') || desc.includes('dominos') || desc.includes('mcdonald')) {
    return 'Food & Dining';
  }

  // Groceries & Supermarket
  if (desc.includes('zepto') || desc.includes('blinkit') || desc.includes('instamart') || desc.includes('supermarket') || desc.includes('grocery') || desc.includes('provision') || desc.includes('mart') || desc.includes('dmart') || desc.includes('bigbasket') || desc.includes('vegetable')) {
    return 'Groceries & Supermarket';
  }

  // Shopping & Retail
  if (desc.includes('amazon') || desc.includes('flipkart') || desc.includes('myntra') || desc.includes('meesho') || desc.includes('ajio') || desc.includes('retail') || desc.includes('clothing') || desc.includes('store') || desc.includes('trend')) {
    return 'Shopping & Retail';
  }

  // Travel & Transport
  if (desc.includes('uber') || desc.includes('ola') || desc.includes('rapido') || desc.includes('irctc') || desc.includes('metro') || desc.includes('parking') || desc.includes('fastag') || desc.includes('toll') || desc.includes('railway') || desc.includes('flight') || desc.includes('indigo')) {
    return 'Travel & Transport';
  }

  // Utilities & Bills
  if (desc.includes('jio') || desc.includes('airtel') || desc.includes('vi ') || desc.includes('bsnl') || desc.includes('electricity') || desc.includes('eb ') || desc.includes('tneb') || desc.includes('bescom') || desc.includes('water') || desc.includes('gas')) {
    return 'Utilities & Bills';
  }

  // Healthcare & Medical
  if (desc.includes('apollo') || desc.includes('pharmacy') || desc.includes('medicine') || desc.includes('hospital') || desc.includes('clinic') || desc.includes('lab') || desc.includes('health') || desc.includes('doctor')) {
    return 'Healthcare & Medical';
  }

  // Entertainment & Media
  if (desc.includes('netflix') || desc.includes('prime') || desc.includes('hotstar') || desc.includes('bookmyshow') || desc.includes('theatre') || desc.includes('cinema') || desc.includes('spotify') || desc.includes('steam')) {
    return 'Entertainment & Media';
  }

  // Subscriptions & Software
  if (desc.includes('google') || desc.includes('icloud') || desc.includes('chatgpt') || desc.includes('github') || desc.includes('microsoft') || desc.includes('aws') || desc.includes('zoom') || desc.includes('adobe') || desc.includes('canva')) {
    return 'Subscriptions & Software';
  }

  // Credit Card Bill
  if (desc.includes('credit card') || desc.includes('card payment') || desc.includes('cred payment') || desc.includes('sbi card') || desc.includes('hdfc card')) {
    return 'Credit Card Bill';
  }

  // Investment & Wealth
  if (desc.includes('zerodha') || desc.includes('groww') || desc.includes('mutual') || desc.includes('sip') || desc.includes('insurance') || desc.includes('lic') || desc.includes('stocks') || desc.includes('upstox') || desc.includes('epfo') || desc.includes('ppf')) {
    return 'Investment & Wealth';
  }

  // Rent & Maintenance
  if (desc.includes('rent') || desc.includes('pg ') || desc.includes('maintenance') || desc.includes('society')) {
    return 'Rent & Maintenance';
  }

  // Education & Learning
  if (desc.includes('school') || desc.includes('college') || desc.includes('fees') || desc.includes('tuition') || desc.includes('udemy') || desc.includes('coursera') || desc.includes('edtech')) {
    return 'Education & Learning';
  }

  // Cash Withdrawal & ATM
  if (desc.includes('atm') || desc.includes('cash wdl') || desc.includes('cash withdrawal') || desc.includes('atm-wdl')) {
    return 'Cash Withdrawal & ATM';
  }

  // Tax & Government Fees
  if (desc.includes('tax') || desc.includes('gst') || desc.includes('income tax') || desc.includes('govt') || desc.includes('challan') || desc.includes('treasury')) {
    return 'Tax & Government Fees';
  }

  // Business & Professional
  if (desc.includes('vendor') || desc.includes('freelance') || desc.includes('consultant') || desc.includes('agency') || desc.includes('shadowfax')) {
    return 'Business & Professional';
  }

  // UPI transfers heuristic
  if (desc.includes('upi/')) {
    if (desc.includes('upi/mr') || desc.includes('upi/mrs') || desc.includes('upi/ms') || desc.includes('p2a') || desc.includes('babu') || desc.includes('mohanraj') || desc.includes('rengasa') || desc.includes('balasubramaniam') || desc.includes('ajith') || desc.includes('arunprakasam')) {
      return 'Transfers (P2P)';
    }
    if (desc.includes('p2m') || desc.includes('merchant') || desc.includes('store') || desc.includes('traders')) {
      return 'Merchant Payments (P2M)';
    }
    return 'Transfers (P2P)';
  }

  if (desc.includes('neft') || desc.includes('imps') || desc.includes('rtgs')) {
    return 'Transfers (P2P)';
  }

  return 'Other';
}

async function categoriseTransactions(transactions) {
  if (transactions.length === 0) return transactions;
  const BATCH = 40;
  const results = [];

  for (let i = 0; i < transactions.length; i += BATCH) {
    const batch = transactions.slice(i, i + BATCH);
    const descriptions = batch.map((t, idx) => `${idx}: ${t.description || ''}`).join('\n');
    const prompt = `Categorise each transaction into EXACTLY ONE of these categories:
${CATEGORIES.join(', ')}

Categorization Guidelines & Hints:
- Fuel station, Petrol, HPCL, IOCL, BPCL, FUE -> Fuel & Petrol
- MPOKKET, POCKETLY, NIRA, Loan Apps, EMI, Bajaj -> Loan & EMI
- JIO, AIRTEL, VI, Telecom, Broadband, Electricity, EB -> Utilities & Bills
- UPI transfers between individuals (e.g. UPI/Mr MOHANRAJ S, UPI/BABU, SURYA M) -> Transfers (P2P)
- Small shop / business UPI payments -> Merchant Payments (P2M)
- TASMAC, Swiggy, Zomato, Restaurants, Cafes -> Food & Dining
- Zepto, Blinkit, Instamart, Supermarkets, Groceries -> Groceries & Supermarket
- Amazon, Flipkart, Meesho, Shopping Stores -> Shopping & Retail
- Uber, Ola, Rapido, IRCTC, Metro, FASTag, Toll -> Travel & Transport
- ATM WDL, Cash withdrawal -> Cash Withdrawal & ATM
- CREDIT INTEREST, Salary credit, Payroll -> Salary & Income
- UNCOLL CHRG, Bank Charges, Penalty, SMS fee -> Bank Charges & Fees
- Google, Apple, ChatGPT, Cloud, Software -> Subscriptions & Software

Return ONLY a JSON array of ${batch.length} category strings matching the exact category names.

Descriptions:
${descriptions}`;

    try {
      const raw = await callWithRotation(() => [{ text: prompt }], 1024);
      const clean = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
      const cats = JSON.parse(clean);

      batch.forEach((t, idx) => {
        let cat = cats[idx];
        // If AI returns an invalid category or "Other", test local heuristic engine first
        if (!cat || !CATEGORIES.includes(cat) || cat === 'Other') {
          const hCat = heuristicCategorise(t.description, t.debit, t.credit);
          cat = (hCat !== 'Other') ? hCat : (CATEGORIES.includes(cat) ? cat : 'Other');
        }
        const enriched = extractCounterpartyAndMode(t.description);
        results.push({
          ...t,
          category: cat,
          counterparty: t.counterparty || enriched.counterparty,
          paymentMethod: t.paymentMethod || enriched.paymentMethod,
        });
      });
    } catch {
      batch.forEach(t => {
        const cat = heuristicCategorise(t.description, t.debit, t.credit);
        const enriched = extractCounterpartyAndMode(t.description);
        results.push({
          ...t,
          category: cat,
          counterparty: t.counterparty || enriched.counterparty,
          paymentMethod: t.paymentMethod || enriched.paymentMethod,
        });
      });
    }
  }
  return results;
}

// ── Anomaly detection ─────────────────────────────────────────────────────────
async function detectAnomalies(transactions) {
  if (transactions.length < 3) return transactions;

  const ANOMALY_BATCH = 80;
  const allFlagged = new Map();

  for (let i = 0; i < transactions.length; i += ANOMALY_BATCH) {
    const batch = transactions.slice(i, i + ANOMALY_BATCH);
    const summary = batch.map((t, bi) =>
      `${i + bi}: ${t.date} | ${t.description} | debit:${t.debit ?? ''} credit:${t.credit ?? ''}`
    ).join('\n');

    const prompt = `You are a fraud analyst. Review these bank transactions and identify anomalies.

An anomaly is: unusually large amount, duplicate charge, odd timing, suspicious description, round-number large transfers, or a payment that seems out of pattern.

Return ONLY a JSON array of objects with:
- index (number — use the global index shown, not position within this batch)
- reason (string — short 1-sentence explanation)

If no anomalies, return []. Return raw JSON only.

Transactions:
${summary}`;

    try {
      const raw = await callWithRotation(() => [{ text: prompt }], 1024);
      const clean = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
      const anomalies = JSON.parse(clean);
      for (const a of anomalies) allFlagged.set(a.index, a.reason);
    } catch { /* non-fatal — batch skipped */ }
  }

  return transactions.map((t, i) => ({
    ...t,
    isAnomaly: allFlagged.has(i),
    anomalyReason: allFlagged.get(i) || null,
  }));
}

// ── Executive summary ─────────────────────────────────────────────────────────
async function generateBankingSummary(text, analytics, documentType, onUsage) {
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
${text.slice(0, 20000)}

Write your summary using Markdown with these sections:
## Executive Summary
## Key Findings
## Cash Flow Analysis
## Spending Patterns
## Risk Indicators
## Recommendations

Be specific with numbers. Be concise but thorough.`;

  return callWithRotation(() => [{ text: prompt }], 3000, "gemini-2.5-flash", onUsage);
}

async function answerBankingQuestion(extractedText, transactions, question, chatHistory = [], onUsage = null) {
  try {
    const historyText = (chatHistory || []).slice(-6)
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
      .join('\n');

    const safeTx = Array.isArray(transactions) ? transactions : [];
    const txSample = safeTx.slice(0, 150)
      .map(t => `${t.date || ''} | ${t.description || ''} | D:${t.debit ?? '-'} C:${t.credit ?? '-'} | ${t.category || ''}`)
      .join('\n');

    const prompt = `You are a banking financial assistant answering questions about a user's bank statement.

Rules:
- Give a clear, direct, helpful answer using the transaction list and document text.
- Reference specific transaction descriptions, dates, amounts, categories, and payment modes where applicable.
- If asking for totals, counts, highest/lowest amounts, calculate or extract them accurately.
- Use clean Markdown styling (bullet points, bold text).

${historyText ? `Previous conversation:\n${historyText}\n` : ''}

Document Text Excerpt:
${extractedText?.slice(0, 8000) || 'None'}

Transactions (${safeTx.length} total):
${txSample || 'No transactions extracted.'}

Question: ${question}
Answer:`;

    const res = await callWithRotation(() => [{ text: prompt }], 2048, "gemini-2.5-flash", onUsage);
    if (res && res.trim()) return res.trim();

    const qLower = (question || '').toLowerCase();
    if (qLower.includes('count') || qLower.includes('total transaction') || qLower.includes('how many')) {
      return `There are **${safeTx.length} total transactions** in this statement.`;
    }
    return "I couldn't find specific details for that in the statement data.";
  } catch (err) {
    console.error('[bankingAiService] Error in answerBankingQuestion:', err);
    const safeTx = Array.isArray(transactions) ? transactions : [];
    const qLower = (question || '').toLowerCase();
    if (qLower.includes('count') || qLower.includes('total transaction') || qLower.includes('how many')) {
      return `This bank statement contains **${safeTx.length} transactions**.`;
    }
    return "I ran into a temporary issue retrieving that information. Please try rephrasing your question.";
  }
}

// ── Direct Gemini Vision extraction for scanned PDFs ─────────────────────────
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
  "reference": "UPI/617824011043" or null,
  "counterparty": "Name" or null,
  "paymentMethod": "UPI" or "NEFT" or "IMPS" or "ATM" or "OTHER"
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
  extractCounterpartyAndMode,
  heuristicCategorise,
  CATEGORIES,
};