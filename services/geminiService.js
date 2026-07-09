// ── Key rotation ──────────────────────────────────────────────────────────────
const GEMINI_KEYS = [
    process.env.GEMINI_KEY_1,
    process.env.GEMINI_KEY_2,
    process.env.GEMINI_KEY_3,
    process.env.GEMINI_KEY_4,
].filter(Boolean);

if (GEMINI_KEYS.length === 0) {
    throw new Error("No Gemini API keys found. Set GEMINI_KEY_1 … GEMINI_KEY_4 in your .env");
}

let currentKeyIndex = 0;

function getCurrentKey() {
    return GEMINI_KEYS[currentKeyIndex];
}

function rotateKey() {
    const prev = currentKeyIndex + 1;
    currentKeyIndex = (currentKeyIndex + 1) % GEMINI_KEYS.length;
    console.log(`🔄 Rotating Gemini key: key ${prev} → key ${currentKeyIndex + 1} of ${GEMINI_KEYS.length}`);
}

// ── Groq fallback ────────────────────────────────────────────────────────────
// Last resort used only when ALL 4 Gemini keys have been tried and the final
// retry also failed. Requires GROQ_API_KEY in .env — if it's not set, the
// fallback is simply skipped and the original Gemini error is thrown as before.
// Groq's free tier is separate from Google's, so a Gemini-side outage or
// quota exhaustion doesn't affect it.
// llama-3.3-70b-versatile was deprecated by Groq (June 2026) in favor of
// openai/gpt-oss-120b, so that's the default now. Override via GROQ_MODEL
// in .env if you'd rather use something else — check console.groq.com/docs/models
// for the current list before picking a different one.
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

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

// Groq's chat API is text-only — it can't accept the inline_data image parts
// Gemini Vision calls use. Pull out just the text parts; if the request was
// ONLY an image (e.g. summarizeImage with no text found), there's nothing
// Groq can do with it and we fail with a clear message instead of pretending.
function partsToPromptText(parts) {
    return parts.filter(p => p.text).map(p => p.text).join("\n\n");
}

async function callGroqFallback(parts, maxOutputTokens) {
    const client = getGroqClient();
    if (!client) {
        throw new Error(
            "No Groq fallback configured. Add GROQ_API_KEY to your .env to enable one."
        );
    }

    const hasImage = parts.some(p => p.inline_data);
    const promptText = partsToPromptText(parts);

    if (!promptText.trim()) {
        throw new Error(
            hasImage
                ? "The Groq fallback can't process images — only Gemini Vision can."
                : "No text content available to send to the Groq fallback."
        );
    }

    // ── NEW: Groq free tier TPM cap is ~8000 tokens total (input + output).
    // Rough heuristic: 1 token ≈ 4 chars. Reserve 1500 tokens for output.
    // So cap input at (8000 - 1500) * 4 = 26000 chars.
    const MAX_INPUT_CHARS = 26000;
    if (promptText.length > MAX_INPUT_CHARS) {
        console.warn(`⚠️  Groq input too large (${promptText.length} chars) — truncating to ${MAX_INPUT_CHARS} chars`);
        promptText = promptText.slice(0, MAX_INPUT_CHARS) + "\n\n[... document truncated for fallback model ...]";
    }

    const completion = await client.chat.completions.create({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: promptText }],
        max_tokens: Math.min(maxOutputTokens, 1500), // Groq's practical per-response ceiling
    });

    return completion.choices?.[0]?.message?.content ?? "";
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Core fetch-based Gemini call ──────────────────────────────────────────────
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// FIX 1: renamed from geminiRequest → callGeminiREST, accepts model param
async function callGeminiREST(parts, maxOutputTokens = 8192, model = "gemini-2.5-flash") {
    const key = getCurrentKey();
    const url = `${BASE_URL}/${model}:generateContent?key=${key}`;

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { maxOutputTokens },
        }),
    });

    const data = await res.json();

    if (!res.ok) {
        const err = new Error(data?.error?.message || `HTTP ${res.status}`);
        err.status = res.status;
        err.body = data;
        throw err;
    }

    return data?.candidates?.[0]?.content?.parts
        ?.filter(p => p.text)
        ?.map(p => p.text)
        ?.join("") ?? "";
}

// FIX 2: error helpers take the full error object (not two separate args)
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

// Catches the "project denied / permission denied / API key invalid /
// service disabled" family of errors. These come back as 403 (or sometimes
// 400) from Google when a specific key's project has been suspended,
// disabled, or restricted — a DIFFERENT problem per key, not a global rate
// limit. Previously these fell through to the generic `throw error`, which
// killed the request on the very first bad key instead of trying the other 3.
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
// FIX 3: callWithRotation now calls callGeminiREST (not the old geminiRequest)
//         and passes error object correctly to isRateLimitError / isOverloadError
async function callWithRotation(buildParts, maxOutputTokens = 8192, model = "gemini-2.5-flash") {
    let keysTriedCount = 0;

    while (keysTriedCount < GEMINI_KEYS.length) {
        try {
            const parts = buildParts();
            return await callGeminiREST(parts, maxOutputTokens, model);
        } catch (error) {
            if (isRateLimitError(error)) {               // ✅ pass full error
                const retryMs = parseRetryAfter(error);
                console.log(`⚠️  Key ${currentKeyIndex + 1} rate limited. Rotating to next key...`);
                rotateKey();
                keysTriedCount++;
                await sleep(retryMs ? Math.min(retryMs, 15000) : 2000);
                continue;
            }
            if (isOverloadError(error)) {                // ✅ pass full error
                console.log(`⏳ Gemini overloaded (503), waiting 4s...`);
                await sleep(4000);
                continue;
            }
            if (isAccessDeniedError(error)) {
                // This key's project is denied/suspended/invalid — that says
                // nothing about the other keys, so rotate and keep going
                // instead of failing the whole request on one bad key.
                console.log(
                    `🚫 Key ${currentKeyIndex + 1} was denied access (${error.message}). Rotating to next key...`
                );
                rotateKey();
                keysTriedCount++;
                continue;
            }
            throw error;
        }
    }

    // All keys exhausted — wait 30s then do one final attempt
    console.log(`⏳ All ${GEMINI_KEYS.length} keys exhausted. Waiting 30s before final retry...`);
    await sleep(30000);

    let finalGeminiError;
    try {
        const parts = buildParts();
        return await callGeminiREST(parts, maxOutputTokens, model);
    } catch (finalError) {
        finalGeminiError = finalError;
        console.log("⚠️  Final Gemini retry also failed. Trying Groq fallback...");
    }

    // ── Groq fallback ──
    try {
        const parts = buildParts();
        const result = await callGroqFallback(parts, maxOutputTokens);
        console.log(`✅ Groq fallback (${GROQ_MODEL}) succeeded.`);
        return result;
    } catch (groqError) {
        console.log(`⚠️  Groq fallback unavailable/failed: ${groqError.message}`);

        if (isAccessDeniedError(finalGeminiError)) {
            throw new Error(
                `All ${GEMINI_KEYS.length} Gemini API keys were denied access by Google, and the Groq fallback ` +
                `also failed (${groqError.message}). Check that each GEMINI_KEY_n in your .env is valid and its ` +
                `project/billing is active.`
            );
        }
        throw new Error(
            `All ${GEMINI_KEYS.length} Gemini API keys are rate limited, and the Groq fallback also failed ` +
            `(${groqError.message}). Please wait a minute and try again.`
        );
    }
}

// ── Banking detection ─────────────────────────────────────────────────────────
function isBankingDocument(text) {
    const lower = text.toLowerCase();
    const bankingKeywords = [
        // Core banking
        "account number", "account balance", "bank statement", "transaction",
        "credit", "debit", "deposit", "withdrawal", "cheque", "check",
        "ifsc", "swift", "iban", "routing number", "sort code",
        "interest rate", "loan", "emi", "mortgage", "overdraft",
        "passbook", "ledger", "remittance", "wire transfer",
        "atm", "net banking", "bank", "savings account", "current account",
        "beneficiary", "payee", "invoice amount", "due amount",
        "outstanding balance", "minimum payment", "statement date",
        // Credit card
        "credit card", "card statement", "billing cycle", "credit limit",
        "minimum due", "payment due date", "cashback", "reward points",
        "over limit", "card number", "cvv",
        // Loan / mortgage
        "principal", "repayment", "emi amount", "loan account", "disbursement",
        "foreclosure", "prepayment", "amortization", "tenure", "collateral",
        // Investment / wealth
        "portfolio", "nav", "mutual fund", "sip", "nifty", "sensex",
        "dividend", "unrealized", "realized gain", "units held", "folio",
        "demat", "broker", "stock", "equity", "bond", "fixed deposit",
        // Insurance / tax
        "premium due", "policy number", "sum assured", "tds deducted",
        "pan number", "gst number", "form 26as", "tds certificate",
        // Indian banking specific
        "neft", "rtgs", "imps", "upi", "nach", "ecs", "micr",
        "cif", "kyc", "nbfc", "rbi",
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
List the 4-8 most important points from the document as bullet points. Each point should be a complete, standalone insight — not a fragment. Prioritize points that carry decisions, findings, requirements, or critical information over minor details.

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
- **Joint Holder (if any):** {name or "None"}
- **Bank / Institution:** {name}
- **Branch:** {branch name and city or "Not stated"}
- **Account Type:** {Savings / Current / Credit Card / Loan / OD / Fixed Deposit / Demat / etc.}
- **Account Number:** {****XXXX — last 4 digits only}
- **Customer ID / CIF:** {value or "Not stated"}
- **IFSC Code:** {value or "Not stated"}
- **MICR Code:** {value or "Not stated"}
- **SWIFT / IBAN (if applicable):** {value or "N/A"}
- **Currency:** {INR / USD / EUR / etc.}
- **Nominee Registered:** {Yes / No / Not stated}
- **Account Status:** {Active / Dormant / Frozen / Overdrawn / In Arrears / Good Standing / Not stated}
- **Statement Period:** {start date – end date or document date}
- **Statement Date:** {date or "Not stated"}

## Key Metrics
List every headline financial figure present. Use "**Label:** Value" on its own line. Include all that apply:
- Opening Balance, Closing Balance, Available Balance, Lien Amount
- Total Credits (count + amount), Total Debits (count + amount)
- Net Change this Period, Average Monthly Balance, Minimum Balance Required
- Credit Limit, Credit Utilized, Available Credit
- Minimum Payment Due, Total Amount Due, Last Payment Received
- Outstanding Principal, Interest Accrued, EMI Amount, Loan Tenure Remaining
- APR / Interest Rate, Compound Frequency
- Fixed Deposit Amount, FD Maturity Value, FD Tenure, FD Interest Rate
- Investment Value, Unrealized Gain/Loss, Dividend Received
- TDS Deducted, GST Amount, Service Tax
- Salary Credited (if salary account)
Aim for 6–14 bullets. Only include what genuinely appears in the document.

## Financial Summary
3–4 paragraphs covering: how the balance moved during the period; what drove the largest inflows and outflows; any visible spending pattern, EMI commitments, or recurring credits; comparison to any prior-period figures mentioned in the document; and whether the account is in a healthy, stressed, or at-risk state based solely on the numbers.

## Transaction Breakdown
If transaction category data is available, list it:
- **{Category}:** {total amount} ({count} transactions)
Examples: Groceries, Utilities, EMI/Loan Repayment, Salary Credit, UPI Transfers, ATM Withdrawals, International Transactions, Insurance Premium, Investment, Tax Payment, Refunds.
If no categorization is present, write "Transaction category breakdown not available in this document."

## Key Transactions
List the 6–12 most significant transactions: largest amounts, recurring items, international transfers, unusual one-offs, reversals, and anything flagged. Format:
**{DD MMM YYYY}** — {Description / Narration}, {Amount} ({Credit / Debit}) | Ref: {ref no. or "N/A"}

## Fees, Charges & Taxes
List every fee, charge, penalty, and tax. "**Label:** Value" format:
- Annual / Renewal Fee, Late Payment Fee, Over-Limit Fee
- ATM Usage Fee (own bank / other bank), SMS Alert Charges, Cheque Return Charges
- NEFT / RTGS / IMPS Transaction Fee, Foreign Currency Markup
- Minimum Balance Penalty, Demat AMC, Locker Charges
- GST on charges, TDS deducted, Other levies
If none: "No fees or charges noted in this document."

## Interest & Loan Details (if applicable)
- **Loan Type:** {Home / Personal / Auto / Education / Gold / OD / etc.}
- **Loan Account Number:** {****XXXX}
- **Disbursement Date:** {date}
- **Sanctioned Amount:** {value}
- **Outstanding Principal:** {value}
- **Interest Rate:** {value} ({Fixed / Floating})
- **EMI Amount:** {value}
- **EMI Due Date:** {date}
- **Loan Maturity Date:** {date}
- **Prepayment Charges:** {value or "Not stated"}
- **Overdue Amount (if any):** {value or "None"}
If not a loan document, write "Not applicable."

## Investment & Wealth Details (if applicable)
- **Portfolio Value:** {value}
- **Asset Allocation:** {Equity / Debt / Liquid / Gold / etc. with %}
- **Unrealized P&L:** {value and %}
- **Realized Gain/Loss (this period):** {value}
- **Dividend / Interest Received:** {value}
- **Units / Shares Held:** {value}
- **NAV / Share Price (as of):** {value and date}
If not applicable, write "Not applicable."

## Compliance & Tax Details (if applicable)
- **PAN:** {masked — last 4 chars only or "Not stated"}
- **GST Number:** {masked or "Not stated"}
- **TDS Deducted (this period):** {value or "None"}
- **Form 16A / 26AS Reference:** {value or "Not stated"}
- **Tax Regime:** {Old / New / Not stated}
If not applicable, write "Not applicable."

## Important Dates & Deadlines
List every critical date as "**Label:** Date":
- Statement Date, Payment Due Date, Grace Period End Date
- EMI Due Date, Loan Maturity Date, FD Maturity Date
- Autopay / ECS Date, Cheque Clearance Date
- Tax Filing Deadline (if referenced), Insurance Premium Due Date
- KYC Renewal Date, Account Review Date

## Risk Flags & Alerts
Flag everything requiring immediate attention, ranked by urgency:
1. Overdue payments or missed EMIs
2. Penalty charges or interest on late payment
3. Bounced / returned items (ECS / NACH / cheques)
4. Minimum balance violation
5. High credit utilization (>80% of limit)
6. Large or unusual one-time transactions
7. International / cross-border transactions without prior notice
8. Account restrictions, lien, or freeze
9. KYC overdue / account at risk of suspension
10. Printed warnings or disclaimers
If none apply, write "No risk flags or alerts noted in this document."

## Conclusion
One tight paragraph synthesizing the overall financial health picture of this account as of the statement date — what is happening, what the key numbers reveal, and what the account holder should double-check based strictly on this document. No financial advice; only factual synthesis.

STRICT RULES:
- Never invent numbers, dates, names, or references not in the document.
- Mask all but the last 4 digits of any account, loan, or card number using ****.
- Do not wrap the response in a code block.
- Every metric in "Key Metrics", "Fees & Charges", "Interest & Loan Details", "Investment Details", "Compliance Details", and "Important Dates" MUST be on its own line in "**Label:** Value" format — it is parsed automatically.
- Do not skip "Key Metrics" — extract everything genuinely present even if brief.
- Do not add headers, sections, or commentary beyond what is listed above.

Document:
${text}
`;

// ── Long-document map-reduce summarization ────────────────────────────────────
// Documents beyond this length (~10+ pages for a typical text-heavy doc) get
// split into chunks, each chunk gets a quick "extract the facts" pass, and the
// combined notes are fed into the normal structured prompt as the final step.
// This keeps each individual call smaller (less quota pressure per call, which
// matters most when keys are already close to their per-minute limits) and
// avoids the model skimming the back half of a very long single prompt.
const SUMMARY_CHUNK_THRESHOLD = 15000; // characters
const SUMMARY_CHUNK_SIZE = 6000;
const SUMMARY_CHUNK_BATCH_SIZE = 3; // chunks processed in parallel per batch

const CHUNK_EXTRACT_PROMPT = (chunk, index, total) => `
You are extracting the key facts from part ${index} of ${total} of a larger document. These notes will be combined with the other parts and summarized as a whole later — this is a note-taking pass, not the final summary.

Return the concrete facts, points, figures, names, dates, and important statements from this excerpt as clear bullet points. Be thorough and specific. Do not write narrative commentary like "this section discusses..." — just the extracted facts themselves. Do not add headers or markdown formatting beyond simple bullets.

Excerpt (part ${index} of ${total}):
${chunk}
`;

async function extractChunkNotes(chunk, index, total) {
    const prompt = CHUNK_EXTRACT_PROMPT(chunk, index, total);
    return callWithRotation(() => [{ text: prompt }], 2048, "gemini-2.5-flash");
}

async function generateSummaryChunked(text, isBanking) {
    const chunks = chunkText(text, SUMMARY_CHUNK_SIZE);
    console.log(`📚 Long document (${text.length} chars, ${chunks.length} chunks) — running map-reduce summarization...`);

    const notesParts = [];
    for (let b = 0; b < chunks.length; b += SUMMARY_CHUNK_BATCH_SIZE) {
        const batch = chunks.slice(b, b + SUMMARY_CHUNK_BATCH_SIZE);
        console.log(`⚙️  Extracting notes: batch ${Math.floor(b / SUMMARY_CHUNK_BATCH_SIZE) + 1}/${Math.ceil(chunks.length / SUMMARY_CHUNK_BATCH_SIZE)}...`);

        const batchNotes = await Promise.all(
            batch.map((chunk, i) => extractChunkNotes(chunk, b + i + 1, chunks.length))
        );
        notesParts.push(...batchNotes);
    }

    const combinedNotes = notesParts
        .map((notes, i) => `--- Part ${i + 1} of ${chunks.length} ---\n${notes}`)
        .join("\n\n");

    console.log(`📝 Combined notes: ${combinedNotes.length} chars (from ${text.length} chars original). Generating final summary...`);

    const prompt = isBanking ? BANKING_PROMPT(combinedNotes) : GENERAL_PROMPT(combinedNotes);
    return callWithRotation(() => [{ text: prompt }], 8192, "gemini-2.5-flash");
}

// ── Public: summarize text document ──────────────────────────────────────────
async function generateSummary(text) {
    const isBanking = isBankingDocument(text);
    if (isBanking) console.log("🏦 Banking document detected — using financial summary prompt");

    if (text.length > SUMMARY_CHUNK_THRESHOLD) {
        return generateSummaryChunked(text, isBanking);
    }

    const prompt = isBanking ? BANKING_PROMPT(text) : GENERAL_PROMPT(text);
    return callWithRotation(() => [{ text: prompt }], 8192, "gemini-2.5-flash");
}

// ── Public: summarize image ───────────────────────────────────────────────────
async function summarizeImage(base64Data, mimeType) {
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
    ], 8192, "gemini-2.5-flash");
}

// ── Structured table extraction ───────────────────────────────────────────────
function buildTablePrompt(text, fields) {
    return `
You are a precise data-extraction engine. Read the document below and extract structured data for these fields: ${fields.join(", ")}.

RULES:
- Return ONLY a raw JSON array of objects — no markdown, no code fences, no commentary before or after.
- Every object must use exactly these keys: ${JSON.stringify(fields)}.
- If the document describes a single entity (one invoice, one statement, one person, one form), return a single-element array.
- If the document contains multiple records (e.g. a list of transactions, multiple line items, multiple people), return one array element per record.
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

// Extracts the JSON value most likely to be our data array out of a model
// response that may include commentary, code fences, or stray "[1]"-style
// footnote brackets the model tacked on around the real array.
function tryParseJSON(rawText) {
    let cleaned = rawText.trim();
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch) cleaned = fenceMatch[1].trim();

    try {
        const direct = JSON.parse(cleaned);
        if (Array.isArray(direct) || (direct && typeof direct === "object")) return direct;
    } catch { /* fall through to bracket scan */ }

    // Scan every '[' as a possible array start and keep whichever balanced
    // bracket pair parses to the largest array of objects — the real table,
    // not an incidental bracketed reference elsewhere in the response.
    const candidates = [];
    for (let start = 0; start < cleaned.length; start++) {
        if (cleaned[start] !== "[") continue;
        let depth = 0;
        for (let i = start; i < cleaned.length; i++) {
            if (cleaned[i] === "[") depth++;
            else if (cleaned[i] === "]") {
                depth--;
                if (depth === 0) {
                    try { candidates.push(JSON.parse(cleaned.slice(start, i + 1))); } catch { /* not valid on its own */ }
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

// Some models wrap the array in an object (e.g. { "rows": [...] }) despite
// instructions, or return a single object for a single-record document.
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

// Asks the model to reformat its own previous (unparseable) reply as strict
// JSON, without re-reading the whole document — fixes format-only failures.
async function repairTableJSON(previousRaw, fields) {
    const prompt = `
The text below was supposed to be a raw JSON array of objects with exactly these keys: ${JSON.stringify(fields)}, but it isn't valid JSON — it may contain commentary, markdown, or stray text around the data.

Rebuild and return ONLY the valid JSON array using exactly those keys. No commentary, no markdown code fences, nothing before or after the array.

Text:
${previousRaw}
`;
    return callWithRotation(() => [{ text: prompt }], 8192, "gemini-2.5-flash");
}

// ── Chunk text into ~3500 char pieces, splitting on newlines ─────────────────
// Smaller chunks → smaller JSON output per call → less chance of the model
// hitting maxOutputTokens mid-object, which was previously causing nearly
// every chunk to fail its first parse and burn an extra repair call.
function chunkText(text, chunkSize = 3500) {
    const chunks = [];
    let start = 0;
    while (start < text.length) {
        let end = start + chunkSize;
        if (end < text.length) {
            // Try to split on a newline so we don't cut mid-row
            const nl = text.lastIndexOf("\n", end);
            if (nl > start) end = nl;
        }
        chunks.push(text.slice(start, end).trim());
        start = end;
    }
    return chunks.filter(c => c.length > 0);
}

// ── Public: extract structured table rows from text (chunked for large docs) ──
async function extractTableData(text, fields) {
    // For short docs, use the simple single-call path
    if (text.length <= 8000) {
        const prompt = buildTablePrompt(text, fields);
        const raw = await callWithRotation(() => [{ text: prompt }], 16384, "gemini-2.5-flash");
        try {
            return parseTableJSON(raw, fields);
        } catch {
            console.log("⚠️  Table JSON parse failed, attempting one repair pass...");
            const repaired = await repairTableJSON(raw, fields);
            return parseTableJSON(repaired, fields);
        }
    }

    // Large document — split into chunks and extract each in parallel batches
    const chunks = chunkText(text, 3500);
    console.log(`📄 Large document detected (${text.length} chars). Splitting into ${chunks.length} chunks...`);

    const BATCH_SIZE = 3; // process 3 chunks at a time to avoid rate limits
    const allRows = [];

    for (let b = 0; b < chunks.length; b += BATCH_SIZE) {
        const batch = chunks.slice(b, b + BATCH_SIZE);
        console.log(`⚙️  Processing chunk batch ${Math.floor(b / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)}...`);

        const batchResults = await Promise.all(
            batch.map(async (chunk, i) => {
                const prompt = buildTablePrompt(chunk, fields);
                const raw = await callWithRotation(() => [{ text: prompt }], 16384, "gemini-2.5-flash");
                try {
                    return parseTableJSON(raw, fields);
                } catch {
                    console.log(`⚠️  Chunk ${b + i + 1} JSON parse failed, attempting repair...`);
                    try {
                        const repaired = await repairTableJSON(raw, fields);
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

    // Deduplicate rows that may have been repeated across chunk boundaries
    const seen = new Set();
    const deduped = allRows.filter(row => {
        const key = JSON.stringify(row);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Remove empty/header-only rows (all field values empty or matching field names)
    const cleaned = deduped.filter(row =>
        fields.some(f => row[f] && row[f].trim() !== "" && row[f].trim().toLowerCase() !== f.toLowerCase())
    );

    console.log(`✅ Extracted ${cleaned.length} rows from ${chunks.length} chunks.`);
    return cleaned;
}

// ── Public: extract structured table rows from an image (incl. handwriting) ──
async function extractTableFromImage(base64Data, mimeType, fields) {
    const prompt = buildTableImagePrompt(fields);
    const raw = await callWithRotation(() => [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: base64Data } },
    ], 8192, "gemini-2.5-flash");
    try {
        return parseTableJSON(raw, fields);
    } catch {
        console.log("⚠️  Table JSON parse failed, attempting one repair pass...");
        const repaired = await repairTableJSON(raw, fields);
        return parseTableJSON(repaired, fields);
    }
}


// ── Public: suggest relevant table fields from document text ─────────────────
async function suggestTableFields(text) {
    // Sample from start, middle AND end so we catch repeating table rows
    // even when the document has a long header (e.g. 18-page bank statements)
    const len = text.length;
    const chunk = 1500;
    const startSnip  = text.slice(0, chunk);
    const midSnip    = text.slice(Math.floor(len / 2) - Math.floor(chunk / 2), Math.floor(len / 2) + Math.floor(chunk / 2));
    const endSnip    = text.slice(Math.max(0, len - chunk));
    const snippet    = [startSnip, midSnip, endSnip].join("\n\n...\n\n");

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

    const raw = await callWithRotation(() => [{ text: prompt }], 512, "gemini-2.5-flash");
    try {
        const clean = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(clean);
        if (Array.isArray(parsed)) return parsed.slice(0, 8).map(f => String(f).trim()).filter(Boolean);
    } catch (e) {
        console.warn("suggestTableFields parse failed:", e.message);
    }
    return [];
}

// ── Public: extract plain text from an image (for chat context) ──────────────
// This is a separate, lightweight call used ONLY to populate extractedText so
// the document chat has real content to work with. It intentionally does NOT
// produce a formatted summary — just the raw readable text from the image.
async function extractTextFromImage(base64Data, mimeType) {
    const prompt = `Read this image carefully and transcribe ALL visible text exactly as it appears, preserving labels, values, and layout as faithfully as plain text allows. Include every word, number, name, and date you can read. Return only the transcribed text — no commentary, no markdown formatting, no introductory sentence.`;
    return callWithRotation(() => [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: base64Data } },
    ], 4096, "gemini-2.5-flash");
}

// ── Public: suggest fields from an image ─────────────────────────────────────
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
    ], 512, "gemini-2.5-flash");
    try {
        const clean = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(clean);
        if (Array.isArray(parsed)) return parsed.slice(0, 8).map(f => String(f).trim()).filter(Boolean);
    } catch (e) {
        console.warn("suggestTableFieldsFromImage parse failed:", e.message);
    }
    return [];
}

module.exports = { generateSummary, summarizeImage, extractTextFromImage, callWithRotation, extractTableData, extractTableFromImage, suggestTableFields, suggestTableFieldsFromImage };