/**
 * geminiService.js  (with usage tracking integrated)
 *
 * MODEL: gemini-3.5-flash (free tier, GA May 2026)
 *   ✗ gemini-2.5-flash — PAID-ONLY since April 1 2026 (was causing 429s)
 *   ✗ gemini-2.0-flash — SHUT DOWN June 1 2026
 *   ✗ gemini-1.5-*    — SHUT DOWN
 *
 * CHANGES vs original:
 *  1. Imports usageTrackingService
 *  2. callGeminiREST now receives the active keyIndex and calls
 *     usageTracking.recordSuccess() on every successful response.
 *  3. callWithRotation calls usageTracking.recordRateLimit() on every
 *     429 rotation and usageTracking.recordError() on unexpected errors.
 *  4. All other logic is identical to the original file.
 *
 * The `feature` parameter ("summarize" | "banking" | "table") is threaded
 * through so per-feature breakdowns are tracked without changing the public API.
 */

const usageTracking = require("./usageTrackingService");

// ── Key rotation ──────────────────────────────────────────────────────────────
const GEMINI_KEYS = [
    process.env.GEMINI_KEY_1,
    process.env.GEMINI_KEY_2,
    process.env.GEMINI_KEY_3,
    process.env.GEMINI_KEY_4,
    process.env.GEMINI_KEY_5,
    process.env.GEMINI_KEY_6,
    process.env.GEMINI_KEY_7,
    process.env.GEMINI_KEY_8,
    process.env.GEMINI_KEY_9,
    process.env.GEMINI_KEY_10,
    process.env.GEMINI_KEY_11,
    process.env.GEMINI_KEY_12,
    process.env.GEMINI_KEY_13,
].filter(Boolean);

if (GEMINI_KEYS.length === 0) {
    throw new Error("No Gemini API keys found. Set GEMINI_KEY_1 … GEMINI_KEY_13 in your .env");
}

// Export so usageTrackingService can read total key count
process.env.GEMINI_KEYS_COUNT = String(GEMINI_KEYS.length);

let currentKeyIndex = 0;

// ── Cooldown tracking ─────────────────────────────────────────────────────────
// Free-tier Gemini: 5 RPM, 20 RPD per key.
// We back off a key for KEY_COOLDOWN_MS after it's rate-limited so we never
// hammer all keys in the same minute and exhaust them simultaneously.
const KEY_COOLDOWN_MS = 62_000; // 62 s — just over 1 minute window
const keyCooldowns = new Array(GEMINI_KEYS.length).fill(0); // timestamp of last rate-limit

function isKeyCoolingDown(index) {
    return Date.now() < keyCooldowns[index];
}

function markKeyCoolingDown(index) {
    keyCooldowns[index] = Date.now() + KEY_COOLDOWN_MS;
    const coolUntil = new Date(keyCooldowns[index]).toLocaleTimeString();
    console.log(`🧊 Key ${index + 1} cooling down until ${coolUntil}`);
}

function getAvailableKeyIndex() {
    // Try keys starting from currentKeyIndex, find first non-cooling one
    for (let i = 0; i < GEMINI_KEYS.length; i++) {
        const idx = (currentKeyIndex + i) % GEMINI_KEYS.length;
        if (!isKeyCoolingDown(idx)) return idx;
    }
    // All keys cooling — find the one that will be ready soonest
    let soonestIdx = 0;
    let soonestTime = Infinity;
    for (let i = 0; i < GEMINI_KEYS.length; i++) {
        if (keyCooldowns[i] < soonestTime) {
            soonestTime = keyCooldowns[i];
            soonestIdx = i;
        }
    }
    return soonestIdx; // caller must wait for it
}

function msUntilKeyReady(index) {
    return Math.max(0, keyCooldowns[index] - Date.now());
}

function getCurrentKey() {
    return GEMINI_KEYS[currentKeyIndex];
}

function rotateKey() {
    const prev = currentKeyIndex;
    currentKeyIndex = (currentKeyIndex + 1) % GEMINI_KEYS.length;
    console.log(`🔄 Rotating Gemini key: key ${prev + 1} → key ${currentKeyIndex + 1} of ${GEMINI_KEYS.length}`);
    return { from: prev, to: currentKeyIndex };
}

// ── Groq fallback ─────────────────────────────────────────────────────────────
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

let groqClient = null;
let groqClientChecked = false;

function getGroqClient() {
    if (!process.env.GROQ_API_KEY) return null;
    if (!groqClient && !groqClientChecked) {
        groqClientChecked = true;
        try {
            const Groq = require("groq-sdk");
            groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
        } catch (e) {
            console.warn("⚠️  groq-sdk not available, Groq fallback disabled:", e.message);
        }
    }
    return groqClient;
}

function partsToPromptText(parts) {
    return parts.filter(p => p.text).map(p => p.text).join("\n\n");
}

async function callGroqFallback(parts, maxOutputTokens, responseMimeType = null) {
    const client = getGroqClient();
    if (!client) {
        throw new Error(
            "No Groq fallback configured. Add GROQ_API_KEY to your .env to enable one."
        );
    }

    const hasImage = parts.some(p => p.inline_data);
    let promptText = partsToPromptText(parts);

    if (!promptText.trim()) {
        throw new Error(
            hasImage
                ? "The Groq fallback can't process images — only Gemini Vision can."
                : "No text content available to send to the Groq fallback."
        );
    }

    // llama-3.3-70b-versatile supports ~128k context; keep headroom for the prompt wrapper
    const MAX_INPUT_CHARS = 90000;
    let truncated = false;
    if (promptText.length > MAX_INPUT_CHARS) {
        console.warn(`⚠️  Groq input too large (${promptText.length} chars) — truncating to ${MAX_INPUT_CHARS} chars`);
        promptText = promptText.slice(0, MAX_INPUT_CHARS) + "\n\n[... document truncated — content beyond this point was omitted ...]";
        truncated = true;
    }

    // Groq supports up to 32,768 output tokens on llama-3.3-70b; cap at 8192 to match Gemini default
    const completion = await client.chat.completions.create({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: promptText }],
        max_tokens: Math.min(maxOutputTokens, 8192),
        ...(responseMimeType === "application/json" ? { response_format: { type: "json_object" } } : {}),
    });

    return completion.choices?.[0]?.message?.content ?? "";
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Core fetch-based Gemini call ──────────────────────────────────────────────
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Makes one REST call to Gemini with the current key.
 * On success: fires usageTracking.recordSuccess() (non-blocking).
 *
 * @param {Array}    parts
 * @param {number}   maxOutputTokens
 * @param {string}   model
 * @param {Function|null} onUsage  - legacy callback passed by controllers
 * @param {string}   feature       - "summarize"|"banking"|"table" for breakdown
 * @param {string|null} responseMimeType - optional "application/json"
 */
async function callGeminiREST(parts, maxOutputTokens = 8192, model = "gemini-3.5-flash", onUsage = null, feature = "summarize", responseMimeType = null) {
    const activeIndex = currentKeyIndex;
    const key = getCurrentKey();
    const url = `${BASE_URL}/${model}:generateContent?key=${key}`;

    const generationConfig = { maxOutputTokens };
    if (responseMimeType) {
        generationConfig.responseMimeType = responseMimeType;
    }

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts }],
            generationConfig,
        }),
    });

    const data = await res.json();

    if (!res.ok) {
        const err = new Error(data?.error?.message || `HTTP ${res.status}`);
        err.status = res.status;
        err.body = data;
        throw err;
    }

    // ── Usage tracking (non-blocking) ─────────────────────────────────────
    if (data?.usageMetadata) {
        // Legacy callback (keeps existing controller behaviour intact)
        if (onUsage) onUsage(data.usageMetadata);
        // New dashboard tracking
        usageTracking.recordSuccess(activeIndex, data.usageMetadata, feature).catch(() => {});
    }

    return data?.candidates?.[0]?.content?.parts
        ?.filter(p => p.text)
        ?.map(p => p.text)
        ?.join("") ?? "";
}

// ── Error classifiers ─────────────────────────────────────────────────────────
function isRateLimitError(error) {
    const msg = JSON.stringify(error?.body || error?.message || "").toLowerCase();
    return (
        error?.status === 429 ||
        msg.includes("too many requests") ||
        msg.includes("quota") ||
        msg.includes("resource_exhausted")
    );
}

function isOverloadError(error) {
    const msg = JSON.stringify(error?.body || error?.message || "").toLowerCase();
    return (
        error?.status === 503 ||
        msg.includes("overloaded") ||
        msg.includes("high demand")
    );
}

function isAccessDeniedError(error) {
    const msg = JSON.stringify(error?.body || error?.message || "").toLowerCase();
    return (
        error?.status === 403 ||
        error?.status === 401 ||
        msg.includes("denied access") ||
        msg.includes("permission_denied") ||
        msg.includes("permission denied") ||
        msg.includes("api key not valid") ||
        msg.includes("api_key_invalid") ||
        msg.includes("service_disabled") ||
        msg.includes("has been suspended") ||
        msg.includes("contact support")
    );
}

function parseRetryAfter(error) {
    const match = JSON.stringify(error?.body || error?.message || "").match(/retry[^\d]*(\d+(\.\d+)?)s/i);
    if (match) return Math.ceil(parseFloat(match[1])) * 1000;
    return null;
}

// ── Retry + rotate across all keys ───────────────────────────────────────────
/**
 * @param {Function} buildParts     - returns the parts array for this call
 * @param {number}   maxOutputTokens
 * @param {string}   model
 * @param {Function|null} onUsage   - legacy token callback from controllers
 * @param {string}   feature        - "summarize"|"banking"|"table"
 * @param {string|null} responseMimeType - optional "application/json"
 */
async function callWithRotation(buildParts, maxOutputTokens = 8192, model = "gemini-3.5-flash", onUsage = null, feature = "summarize", responseMimeType = null) {
    const MAX_ATTEMPTS = GEMINI_KEYS.length * 2; // allow re-trying keys after cooldown expires
    let attempts = 0;
    let overloadRetries = 0;
    const MAX_OVERLOAD_RETRIES = 8;

    while (attempts < MAX_ATTEMPTS) {
        // ── Pick the best available key ───────────────────────────────────────
        const chosenIdx = getAvailableKeyIndex();
        const waitMs = msUntilKeyReady(chosenIdx);

        if (waitMs > 0) {
            console.log(`⏳ All keys cooling down. Best key ${chosenIdx + 1} ready in ${(waitMs / 1000).toFixed(1)}s — waiting...`);
            await sleep(waitMs + 200); // tiny buffer
        }

        currentKeyIndex = chosenIdx;

        try {
            const parts = buildParts();
            const result = await callGeminiREST(parts, maxOutputTokens, model, onUsage, feature, responseMimeType);
            overloadRetries = 0; // reset on success
            return result;
        } catch (error) {
            if (isRateLimitError(error)) {
                console.log(`⚠️  Key ${currentKeyIndex + 1} rate limited. Cooling it down for ${KEY_COOLDOWN_MS / 1000}s...`);
                markKeyCoolingDown(currentKeyIndex);
                usageTracking.recordRateLimit(currentKeyIndex, -1).catch(() => {});
                attempts++;
                // Don't sleep here — getAvailableKeyIndex will find the next ready key
                continue;
            }

            if (isOverloadError(error)) {
                overloadRetries++;
                if (overloadRetries > MAX_OVERLOAD_RETRIES) {
                    console.log(`⚠️  Gemini overloaded too many times (${overloadRetries}x). Trying Groq fallback...`);
                    break; // fall through to Groq
                }
                const backoff = Math.min(4000 * overloadRetries, 30000);
                console.log(`⏳ Gemini overloaded (503), waiting ${backoff / 1000}s... (attempt ${overloadRetries}/${MAX_OVERLOAD_RETRIES})`);
                await sleep(backoff);
                continue;
            }

            if (isAccessDeniedError(error)) {
                console.log(`🚫 Key ${currentKeyIndex + 1} denied access (${error.message}). Permanently skipping for this request...`);
                // Cool it down for 24h effectively (it's broken, not just rate-limited)
                keyCooldowns[currentKeyIndex] = Date.now() + 24 * 60 * 60 * 1000;
                usageTracking.recordRateLimit(currentKeyIndex, -1).catch(() => {});
                attempts++;
                continue;
            }

            // Unexpected error — record and rethrow immediately
            usageTracking.recordError(currentKeyIndex).catch(() => {});
            throw error;
        }
    }

    // ── All keys exhausted or overloaded too many times → try Groq ───────────
    console.log(`⚠️  Gemini keys exhausted after ${attempts} attempts. Trying Groq fallback...`);

    let finalGeminiError = new Error(`All ${GEMINI_KEYS.length} Gemini keys rate limited or denied.`);
    try {
        const parts = buildParts();
        const result = await callGroqFallback(parts, maxOutputTokens, responseMimeType);
        console.log(`✅ Groq fallback (${GROQ_MODEL}) succeeded.`);
        return result;
    } catch (groqError) {
        console.log(`⚠️  Groq fallback unavailable/failed: ${groqError.message}`);
        throw new Error(
            `All ${GEMINI_KEYS.length} Gemini API keys are rate limited/denied, and the Groq fallback also failed ` +
            `(${groqError.message}). Please wait a minute and try again.`
        );
    }
}

// ── Banking detection ─────────────────────────────────────────────────────────
function isBankingDocument(text) {
    const lower = text.toLowerCase();
    const bankingKeywords = [
        "account number", "account balance", "bank statement", "transaction",
        "credit", "debit", "deposit", "withdrawal", "cheque", "check",
        "ifsc", "swift", "iban", "routing number", "sort code",
        "interest rate", "loan", "emi", "mortgage", "overdraft",
        "passbook", "ledger", "remittance", "wire transfer",
        "atm", "net banking", "bank", "savings account", "current account",
        "beneficiary", "payee", "invoice amount", "due amount",
        "outstanding balance", "minimum payment", "statement date",
        "credit card", "card statement", "billing cycle", "credit limit",
        "minimum due", "payment due date", "cashback", "reward points",
        "over limit", "card number", "cvv",
        "principal", "repayment", "emi amount", "loan account", "disbursement",
        "foreclosure", "prepayment", "amortization", "tenure", "collateral",
        "portfolio", "nav", "mutual fund", "sip", "nifty", "sensex",
        "dividend", "unrealized", "realized gain", "units held", "folio",
        "demat", "broker", "stock", "equity", "bond", "fixed deposit",
        "premium due", "policy number", "sum assured", "tds deducted",
        "pan number", "gst number", "form 26as", "tds certificate",
        "neft", "rtgs", "imps", "upi", "nach", "ecs", "micr",
        "cif", "kyc", "nbfc", "rbi",
        // financial statements / microfinance / accounting
        "balance sheet", "income statement", "statement of income", "net income",
        "gross loans", "loan loss reserve", "loans outstanding", "provision for loan",
        "financial income", "financial costs", "financial margin", "operating expenses",
        "total assets", "total liabilities", "total equity", "retained surplus",
        "cash flow", "sources of funds", "uses of funds", "loan fund capital",
        "microfinance", "credit programme", "credit program", "concessional",
        "past-due", "restructured loan", "write-off", "excess of income",
        "grant revenue", "operational self-sufficiency",
    ];
    const matches = bankingKeywords.filter(kw => lower.includes(kw));
    return matches.length >= 3;
}

// ── Prompts ───────────────────────────────────────────────────────────────────
const GENERAL_PROMPT = (text) => `
You are a senior research analyst and professional document summarizer with expertise across business, technical, academic, and legal domains. Your job is to read the document below carefully and produce a summary that is accurate, well-organized, and genuinely useful — not a generic restatement of the text.

CORE PRINCIPLES:
- Be precise. Never invent facts, numbers, names, or conclusions that are not in the document.
- Be concise but complete. Every sentence should carry real information.
- Preserve the original meaning and intent of the document. Do not add your own opinions or external knowledge.
- Use plain, professional language. Avoid filler phrases like "this document discusses" or "in conclusion, it is clear that".
- If the document is short, technical, or list-like, adapt the depth of each section accordingly rather than padding it artificially.
- If the document contains specific data (dates, figures, names, deadlines, requirements), preserve them exactly as written.

OUTPUT FORMAT:
Return the summary in clean Markdown, following this exact structure and nothing else:

# {A concise, descriptive title capturing the document's core subject}

## Short Summary
Write 2-4 well-structured paragraphs giving a clear overview of what the document is about, its purpose, scope, and main takeaways. A reader who only reads this section should understand the essence of the entire document.

## Key Points
List the most important points from the document as bullet points — use as many bullets as needed to cover all significant findings (minimum 4, no artificial cap). Each point should be a complete, standalone insight — not a fragment. For financial or statistical documents, include every named figure, ratio, and year-over-year comparison. Prioritize points that carry decisions, findings, requirements, or critical information over minor details.

## Important Information
Call out any of the following if present in the document: specific numbers, statistics, dates, deadlines, names of people or organizations, technical specifications, requirements, risks, or warnings. If the document contains none of these, write "No additional critical details beyond the key points above." Do not fabricate this section if it doesn't apply.

## Conclusion
Write one tight paragraph that synthesizes the overall significance of the document — what it means, what should happen next, or what the reader should take away from it.

STRICT RULES:
- Do not include any text, headers, or commentary outside the four sections above.
- Do not use hashtags anywhere in the body text — only the single "#" for the title and "##" for section headers as shown.
- Do not wrap the entire response in a code block.
- Do not repeat the section headers' instructions back to the user.
- Bold key terms, names, or figures within paragraphs and bullets where it aids readability, but do not overuse bold formatting.
- If the document is incomplete, corrupted, or contains very little extractable content, state this clearly in the Short Summary section instead of guessing at missing context.

Document:
${text}
`;

const BANKING_PROMPT = (text) => `
You are a senior banking and financial document analyst with 20+ years of institutional experience analyzing bank statements, credit card bills, loan agreements, trade finance documents, investment account statements, insurance premium notices, tax notices, UPI/NEFT/RTGS remittance slips, GST invoices, and salary account reports. Your output must be exhaustive, financially precise, and structured — it feeds directly into a visual dashboard and slide deck, so every section matters.

CORE PRINCIPLES:
- Extract EVERY financial figure, date, reference number, and account detail exactly as written. Never round or approximate.
- Identify and clearly present: masked account numbers, all balance types, transaction amounts, all dates, all fees/taxes, interest rates, IFSC/SWIFT/IBAN, payee/payer names, PAN/GST numbers (if any), and account status.
- Surface period-over-period changes, transaction category breakdowns, unusual one-offs, and any discrepancy or warning.
- Do NOT add financial advice. Report and organize only what the document contains.
- If a field is absent, write "Not present in this document" — never fabricate.

OUTPUT FORMAT:
Return clean Markdown following this EXACT section order. Every key-value pair on its own line as "**Label:** Value". This format is parsed programmatically.

# {Document type and account/entity — e.g. "Bank Statement — HDFC Savings ****4521" or "Credit Card Bill — SBI Card ****8822"}

## Account Overview
- **Account Holder Name:** {full name or "Not specified"}
- **Bank / Institution:** {name}
- **Account Type:** {Savings / Current / Credit Card / Loan / OD / Fixed Deposit / Demat / etc.}
- **Account Number:** {****XXXX — last 4 digits only}
- **IFSC Code:** {value or "Not stated"}
- **Currency:** {INR / USD / EUR / etc.}
- **Account Status:** {Active / Dormant / Frozen / Overdrawn / In Arrears / Good Standing / Not stated}
- **Statement Period:** {start date – end date or document date}

## Key Metrics
List every headline financial figure present. Use "**Label:** Value" on its own line.

## Financial Summary
3–4 paragraphs covering how the balance moved during the period.

## Transaction Breakdown
List every transaction category with total amounts. If the document contains prior-year or comparative figures, include them as sub-items (e.g. "1995: X | 1994: Y | Change: +Z%"). Do not omit any line item that has a figure attached.

## Key Transactions
List ALL transactions above INR 10,000 (or 10% of the opening balance, whichever is lower). For documents with fewer than 30 transactions, list every single one. For high-volume statements (30+ transactions), list all large inflows, all large outflows, all fees/charges, and any transaction that caused the balance to drop below INR 500. Format each as: "**Date | Description | Amount | Balance after**".

## Fees, Charges & Taxes
List every fee, charge, penalty, and tax.

## Risk Flags & Alerts
Flag everything requiring immediate attention.

## Conclusion
One tight paragraph synthesizing the overall financial health picture.

Document:
${text}
`;

// ── Long-document map-reduce summarization ────────────────────────────────────
const SUMMARY_CHUNK_THRESHOLD = 15000;
const SUMMARY_CHUNK_SIZE = 10000;   // raised from 6000 — fewer splits = fewer boundary losses
const SUMMARY_CHUNK_BATCH_SIZE = 3;
const SUMMARY_CHUNK_OVERLAP = 300;  // chars of overlap carried from previous chunk to next

const CHUNK_EXTRACT_PROMPT = (chunk, index, total) => `
You are extracting ALL key facts from part ${index} of ${total} of a larger financial document. These notes will be combined with notes from other parts for a final summary — this is a thorough note-taking pass.

RULES:
- Extract EVERY transaction: date, description, withdrawal amount, deposit amount, and resulting balance.
- Preserve all currency amounts EXACTLY as written (e.g. "INR 3,32,827.00", not "3.3 lakh").
- Capture account details, opening/closing balances, IFSC, MICR, branch, account holder name, period.
- Flag any balance that drops below INR 100, any single transaction above INR 10,000, any fees or charges.
- Do NOT summarize or paraphrase numbers — copy them exactly.
- Do NOT write narrative commentary. Return bullet points only.
- If this chunk contains no transactions (e.g. regulatory notices), summarize those notices briefly.

Excerpt (part ${index} of ${total}):
${chunk}
`;

async function extractChunkNotes(chunk, index, total, onUsage = null, feature = "summarize") {
    const prompt = CHUNK_EXTRACT_PROMPT(chunk, index, total);
    return callWithRotation(() => [{ text: prompt }], 4096, "gemini-3.5-flash", onUsage, feature);
}

async function generateSummaryChunked(text, isBanking, onUsage = null) {
    // Build overlapping chunks: each chunk carries the last SUMMARY_CHUNK_OVERLAP chars
    // of the previous chunk so table rows that span a boundary are never lost.
    const rawChunks = chunkText(text, SUMMARY_CHUNK_SIZE);
    const chunks = rawChunks.map((chunk, i) => {
        if (i === 0) return chunk;
        const prevTail = rawChunks[i - 1].slice(-SUMMARY_CHUNK_OVERLAP);
        return prevTail + "\n" + chunk;
    });
    const feature = isBanking ? "banking" : "summarize";
    console.log(`📚 Long document (${text.length} chars, ${chunks.length} chunks, overlap=${SUMMARY_CHUNK_OVERLAP}) — running map-reduce summarization...`);

    const notesParts = [];
    for (let b = 0; b < chunks.length; b += SUMMARY_CHUNK_BATCH_SIZE) {
        const batch = chunks.slice(b, b + SUMMARY_CHUNK_BATCH_SIZE);
        console.log(`⚙️  Extracting notes: batch ${Math.floor(b / SUMMARY_CHUNK_BATCH_SIZE) + 1}/${Math.ceil(chunks.length / SUMMARY_CHUNK_BATCH_SIZE)}...`);

        const batchNotes = await Promise.all(
            batch.map((chunk, i) => extractChunkNotes(chunk, b + i + 1, chunks.length, onUsage, feature))
        );
        notesParts.push(...batchNotes);
    }

    const combinedNotes = notesParts
        .map((notes, i) => `--- Part ${i + 1} of ${chunks.length} ---\n${notes}`)
        .join("\n\n");

    console.log(`📝 Combined notes: ${combinedNotes.length} chars. Generating final summary...`);

    const prompt = isBanking ? BANKING_PROMPT(combinedNotes) : GENERAL_PROMPT(combinedNotes);
    return callWithRotation(() => [{ text: prompt }], 8192, "gemini-3.5-flash", onUsage, feature);
}

// ── Public: summarize text document ──────────────────────────────────────────
async function generateSummary(text, onUsage) {
    const isBanking = isBankingDocument(text);
    const feature = isBanking ? "banking" : "summarize";
    if (isBanking) console.log("🏦 Banking document detected — using financial summary prompt");

    if (text.length > SUMMARY_CHUNK_THRESHOLD) {
        return generateSummaryChunked(text, isBanking, onUsage);
    }

    const prompt = isBanking ? BANKING_PROMPT(text) : GENERAL_PROMPT(text);
    return callWithRotation(() => [{ text: prompt }], 8192, "gemini-3.5-flash", onUsage, feature);
}

// ── Public: summarize image ───────────────────────────────────────────────────
async function summarizeImage(base64Data, mimeType, onUsage) {
    const prompt = `
You are an expert document and image analyst. Examine this image carefully and extract all readable text and meaningful content from it.

Then produce a structured summary in clean Markdown:

# {Describe what this image shows — document type, subject, or scene}

## Short Summary
2-3 paragraphs describing what the image contains, its purpose, and main content.

## Key Points
- List 4-6 key pieces of information, data, text, or observations from the image.

## Important Information
Extract any specific numbers, dates, names, prices, labels, or other precise data visible in the image. If none, write "No specific data found."

## Conclusion
One paragraph on what this image represents and what a viewer should take away from it.

RULES:
- If the image contains readable text, extract and reference it directly.
- If it's a chart or graph, describe the data shown.
- If it's a photograph, describe the scene and any visible text or labels.
- Never fabricate data that isn't visible in the image.
- Do not wrap in code blocks.
`;
    return callWithRotation(() => [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: base64Data } },
    ], 8192, "gemini-3.5-flash", onUsage, "summarize");
}

// ── Table extraction helpers ──────────────────────────────────────────────────
function buildTablePrompt(text, fields) {
    return `
You are a precise data-extraction engine. Read the document below and extract structured data for these fields: ${fields.join(", ")}.

RULES:
- Return ONLY a raw JSON array of objects — no markdown, no code fences, no commentary before or after.
- Every object must use exactly these keys: ${JSON.stringify(fields)}.
- If the document describes a single entity, return a single-element array.
- If the document contains multiple records, return one array element per record.
- If a field's value isn't present, use an empty string "" — never invent data.
- Preserve numbers, dates, and names exactly as written in the document.

Document:
${text}
`;
}

function buildTableImagePrompt(fields) {
    return `
You are a precise data-extraction engine. Carefully read this image — including any handwritten text — and extract structured data for these fields: ${fields.join(", ")}.

RULES:
- Return ONLY a raw JSON array of objects — no markdown, no code fences, no commentary before or after.
- Every object must use exactly these keys: ${JSON.stringify(fields)}.
- If the image shows a single entity, return a single-element array. If it shows multiple records, return one element per record.
- If a field's value isn't visible or legible, use an empty string "" — never invent data.
- Read handwriting as carefully as possible; use context to resolve ambiguous characters.
`;
}

function tryParseJSON(rawText) {
    let cleaned = rawText.trim();
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch) cleaned = fenceMatch[1].trim();

    try {
        const direct = JSON.parse(cleaned);
        if (Array.isArray(direct) || (direct && typeof direct === "object")) return direct;
    } catch { /* fall through */ }

    const candidates = [];
    for (let start = 0; start < cleaned.length; start++) {
        if (cleaned[start] !== "[") continue;
        let depth = 0;
        for (let i = start; i < cleaned.length; i++) {
            if (cleaned[i] === "[") depth++;
            else if (cleaned[i] === "]") {
                depth--;
                if (depth === 0) {
                    try { candidates.push(JSON.parse(cleaned.slice(start, i + 1))); } catch { }
                    break;
                }
            }
        }
    }

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => {
        const score = (v) => (Array.isArray(v) ? v.length * (v.every(x => x && typeof x === "object") ? 10 : 1) : 0);
        return score(b) - score(a);
    });
    return candidates[0];
}

function coerceToRowsArray(parsed) {
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") {
        for (const key of ["rows", "data", "table", "result", "items", "records"]) {
            if (Array.isArray(parsed[key])) return parsed[key];
        }
        return [parsed];
    }
    return null;
}

function parseTableJSON(raw, fields) {
    const parsed = coerceToRowsArray(tryParseJSON(raw));

    if (!Array.isArray(parsed)) {
        console.error("Gemini table extraction returned unparseable output:", raw.slice(0, 1000));
        throw new Error("Could not extract structured table data from this document.");
    }

    return parsed.map(row => {
        const safeRow = {};
        fields.forEach(f => { safeRow[f] = row && row[f] != null ? String(row[f]) : ""; });
        return safeRow;
    });
}

async function repairTableJSON(previousRaw, fields, onUsage = null) {
    const prompt = `
The text below was supposed to be a raw JSON array of objects with exactly these keys: ${JSON.stringify(fields)}, but it isn't valid JSON.

Rebuild and return ONLY the valid JSON array using exactly those keys. No commentary, no markdown code fences, nothing before or after the array.

Text:
${previousRaw}
`;
    return callWithRotation(() => [{ text: prompt }], 8192, "gemini-3.5-flash", onUsage, "table");
}

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

function chunkText(text, chunkSize = 4000) {
    const chunks = [];
    let start = 0;
    while (start < text.length) {
        let end = start + chunkSize;
        if (end < text.length) {
            const nl = text.lastIndexOf("\n", end);
            if (nl > start) end = nl;
        }
        chunks.push(text.slice(start, end).trim());
        start = end;
    }
    return chunks.filter(c => c.length > 0);
}

async function extractTableData(text, fields, onUsage) {
    const cleanedText = cleanTableText(text);

    if (cleanedText.length <= 8000) {
        const prompt = buildTablePrompt(cleanedText, fields);
        const raw = await callWithRotation(() => [{ text: prompt }], 16384, "gemini-3.5-flash", onUsage, "table");
        try {
            return parseTableJSON(raw, fields);
        } catch {
            console.log("⚠️  Table JSON parse failed, attempting one repair pass...");
            const repaired = await repairTableJSON(raw, fields, onUsage);
            return parseTableJSON(repaired, fields);
        }
    }

    const chunks = chunkText(cleanedText, 4000);
    console.log(`📄 Large document detected (${cleanedText.length} chars). Splitting into ${chunks.length} chunks...`);

    const BATCH_SIZE = 3;
    const allRows = [];

    for (let b = 0; b < chunks.length; b += BATCH_SIZE) {
        const batch = chunks.slice(b, b + BATCH_SIZE);
        console.log(`⚙️  Processing chunk batch ${Math.floor(b / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)}...`);

        const batchResults = await Promise.all(
            batch.map(async (chunk, i) => {
                const prompt = buildTablePrompt(chunk, fields);
                const raw = await callWithRotation(() => [{ text: prompt }], 16384, "gemini-3.5-flash", onUsage, "table");
                try {
                    return parseTableJSON(raw, fields);
                } catch {
                    console.log(`⚠️  Chunk ${b + i + 1} JSON parse failed, attempting repair...`);
                    try {
                        const repaired = await repairTableJSON(raw, fields, onUsage);
                        return parseTableJSON(repaired, fields);
                    } catch {
                        console.warn(`⚠️  Chunk ${b + i + 1} could not be parsed, skipping.`);
                        return [];
                    }
                }
            })
        );

        for (const rows of batchResults) {
            allRows.push(...rows);
        }
    }

    const seen = new Set();
    const deduped = allRows.filter(row => {
        const key = JSON.stringify(row);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    const cleanedRows = deduped.filter(row =>
        fields.some(f => row[f] && row[f].trim() !== "" && row[f].trim().toLowerCase() !== f.toLowerCase())
    );

    console.log(`✅ Extracted ${cleanedRows.length} rows from ${chunks.length} chunks.`);
    return cleanedRows;
}

async function extractTableFromImage(base64Data, mimeType, fields, onUsage) {
    const prompt = buildTableImagePrompt(fields);
    const raw = await callWithRotation(() => [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: base64Data } },
    ], 8192, "gemini-3.5-flash", onUsage, "table");
    try {
        return parseTableJSON(raw, fields);
    } catch {
        console.log("⚠️  Table JSON parse failed, attempting one repair pass...");
        const repaired = await repairTableJSON(raw, fields, onUsage);
        return parseTableJSON(repaired, fields);
    }
}

async function suggestTableFields(textData) {
    const text = typeof textData === 'object' ? (textData.rawText || textData.text || "") : String(textData);
    const len = text.length;
    const chunk = 1500;
    const startSnip = text.slice(0, chunk);
    const midSnip = text.slice(Math.floor(len / 2) - Math.floor(chunk / 2), Math.floor(len / 2) + Math.floor(chunk / 2));
    const endSnip = text.slice(Math.max(0, len - chunk));
    const snippet = [startSnip, midSnip, endSnip].join("\n\n...\n\n");

    const prompt = `You are a data analyst. Read the document excerpts below and suggest the most useful column names for extracting its repeating data into a structured table.

RULES:
- Return ONLY a JSON array of strings — field names only
- 4-8 fields maximum, concise (1-4 words), Title Case
- Pick fields that represent repeating rows/records in the document
- Financial/banking: suggest Date, Description, Debit, Credit, Balance, Reference No
- Invoice: Item, Quantity, Unit Price, Amount, Tax
- Resume/HR: Name, Role, Skills, Experience, Email
- General list: use whatever repeating columns you see
- Return raw JSON array only, no markdown, no explanation

Document excerpts:
${snippet}`;

    const raw = await callWithRotation(() => [{ text: prompt }], 512, "gemini-3.5-flash");
    try {
        const clean = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(clean);
        if (Array.isArray(parsed)) return parsed.slice(0, 8).map(f => String(f).trim()).filter(Boolean);
    } catch (e) {
        console.warn("suggestTableFields parse failed:", e.message);
    }
    return [];
}

async function extractTextFromImage(base64Data, mimeType, onUsage) {
    const prompt = `Read this image carefully and transcribe ALL visible text exactly as it appears, preserving labels, values, and layout as faithfully as plain text allows. Include every word, number, name, and date you can read. Return only the transcribed text — no commentary, no markdown formatting, no introductory sentence.`;
    return callWithRotation(() => [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: base64Data } },
    ], 4096, "gemini-3.5-flash", onUsage, "summarize");
}

async function suggestTableFieldsFromImage(base64Data, mimeType) {
    const prompt = `You are a data analyst. Look at this image and suggest the most useful column names for extracting its data into a structured table.

RULES:
- Return ONLY a JSON array of strings
- 4-8 fields maximum, concise Title Case names
- Base suggestions on repeating data you see (rows, entries, line items)
- Return raw JSON array only, no markdown, no explanation
Example: ["Name", "Date", "Amount", "Description"]`;

    const raw = await callWithRotation(() => [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: base64Data } },
    ], 512, "gemini-3.5-flash");
    try {
        const clean = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(clean);
        if (Array.isArray(parsed)) return parsed.slice(0, 8).map(f => String(f).trim()).filter(Boolean);
    } catch (e) {
        console.warn("suggestTableFieldsFromImage parse failed:", e.message);
    }
    return [];
}

module.exports = {
    generateSummary,
    summarizeImage,
    extractTextFromImage,
    callWithRotation,
    extractTableData,
    extractTableFromImage,
    suggestTableFields,
    suggestTableFieldsFromImage,
};