/**
 * presentationAiService.js — v5
 * Fixes:
 *  1. Banking pre-detection: requires STRONG banking signals (UPI/, NEFT, IFSC, etc.)
 *     to avoid mis-classifying P&L / Balance Sheet docs as banking
 *  2. Financial report pre-detection added (profit, loss, revenue, equity, etc.)
 *  3. Strategy: 4096 tokens + compact prompt + partialJsonExtract fallback
 *  4. unwrapDocumentText at entry
 *  5. 6-pass JSON repair
 *  6. Banking outline hardcoded, other outlines structure-only
 *  7. Slide content batched for large outlines
 */

const { callWithRotation } = require("./geminiService");

// ── JSON repair utilities ─────────────────────────────────────────────────────

function repairJsonString(raw) {
  let s = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  s = s.replace(/,\s*([}\]])/g, "$1");
  s = s.replace(/:\s*'([^']*)'/g, ': "$1"');
  s = s.replace(/([{,]\s*)'([^']+)'\s*:/g, '$1"$2":');
  s = s.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
  return s;
}

function tryRecoverTruncatedArray(s) {
  const lastBrace = s.lastIndexOf("}");
  if (lastBrace < 0) return null;
  const partial = s.slice(0, lastBrace + 1);
  const arrStart = partial.indexOf("[");
  if (arrStart < 0) return null;
  try {
    const parsed = JSON.parse(partial.slice(arrStart) + "]");
    if (Array.isArray(parsed) && parsed.length > 0) {
      console.warn(`⚠️  Recovered truncated JSON array: ${parsed.length} items`);
      return parsed;
    }
  } catch {}
  return null;
}

// Extracts all COMPLETE JSON objects from a potentially truncated string
// Works even when the array is cut mid-string inside an element
function extractCompleteObjects(s) {
  const results = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        try {
          const parsed = JSON.parse(s.slice(start, i + 1));
          if (parsed && typeof parsed === 'object' && parsed.slideType) results.push(parsed);
        } catch {}
        start = -1;
      }
    }
  }
  return results.length > 0 ? results : null;
}

function partialJsonExtract(s) {
  const result = {};
  const strRe = /"([a-zA-Z_][a-zA-Z0-9_]*)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = strRe.exec(s)) !== null) result[m[1]] = m[2];
  const numRe = /"([a-zA-Z_][a-zA-Z0-9_]*)"\s*:\s*([0-9]+(?:\.[0-9]+)?)/g;
  while ((m = numRe.exec(s)) !== null) { if (!(m[1] in result)) result[m[1]] = parseFloat(m[2]); }
  const boolRe = /"([a-zA-Z_][a-zA-Z0-9_]*)"\s*:\s*(true|false)/g;
  while ((m = boolRe.exec(s)) !== null) { if (!(m[1] in result)) result[m[1]] = m[2] === "true"; }
  const arrRe = /"([a-zA-Z_][a-zA-Z0-9_]*)"\s*:\s*\[((?:"[^"]*"(?:\s*,\s*)?)+)\]/g;
  while ((m = arrRe.exec(s)) !== null) { try { result[m[1]] = JSON.parse("[" + m[2] + "]"); } catch {} }
  return Object.keys(result).length > 0 ? result : null;
}

function parseJsonResponse(raw) {
  let s = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  try { return JSON.parse(s); } catch {}
  const arrM = s.match(/(\[[\s\S]*\])/);
  if (arrM) { try { return JSON.parse(arrM[1]); } catch {} }
  const objM = s.match(/(\{[\s\S]*\})/);
  if (objM) { try { return JSON.parse(objM[1]); } catch {} }
  const repaired = repairJsonString(s);
  try { return JSON.parse(repaired); } catch {}
  const arrM2 = repaired.match(/(\[[\s\S]*\])/);
  if (arrM2) { try { return JSON.parse(arrM2[1]); } catch {} }
  const recovered = tryRecoverTruncatedArray(repaired) || tryRecoverTruncatedArray(s);
  if (recovered) return recovered;
  try { return JSON.parse(repaired.replace(/[\x00-\x1F\x7F]/g, " ")); } catch {}
  // Pass 7: extract any complete slide objects even from mid-string truncation
  const extracted = extractCompleteObjects(repaired) || extractCompleteObjects(s);
  if (extracted && extracted.length > 0) {
    console.warn(`⚠️  Extracted ${extracted.length} complete objects from truncated response`);
    return extracted;
  }
  throw new Error("Unable to parse AI JSON response: " + s.slice(0, 200));
}

// ── Document text unwrapper ───────────────────────────────────────────────────

function unwrapDocumentText(documentText) {
  if (!documentText || typeof documentText !== "string") return documentText;
  const t = documentText.trim();
  if (!t.startsWith("{")) return documentText;
  try {
    const obj = JSON.parse(t);
    if (obj && typeof obj.rawText === "string" && obj.rawText.length > 10) {
      console.log(`🔓 Unwrapped JSON-stringified documentText → ${obj.rawText.length} chars (was ${t.length})`);
      return obj.rawText;
    }
    if (obj && typeof obj.text === "string") return obj.text;
    if (obj && typeof obj.content === "string") return obj.content;
  } catch {}
  return documentText;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeTruncate(text, maxChars = 80000) {
  if (!text || text.length <= maxChars) return text;
  const half = Math.floor(maxChars / 2);
  return text.slice(0, half) + "\n\n[... middle truncated ...]\n\n" + text.slice(-half);
}

async function aiCall(prompt, maxTokens = 8192) {
  return callWithRotation(() => [{ text: prompt }], maxTokens, "gemini-3.5-flash", null, "summarize");
}

async function aiCallWithImage(prompt, base64Data, mimeType, maxTokens = 8192) {
  return callWithRotation(
    () => [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Data } }],
    maxTokens, "gemini-3.5-flash", null, "summarize"
  );
}

// ── Pre-detection (zero tokens) ───────────────────────────────────────────────

function preDetectDocumentType(text) {
  const lower = text.toLowerCase().slice(0, 8000);

  // Financial report detection — check FIRST so P&L doesn't get caught by weak banking signals
  const financialSignals = [
    "profit and loss", "p&l", "income statement", "balance sheet",
    "gross profit", "net profit", "net income", "ebitda", "revenue",
    "operating expenses", "cost of goods", "retained earnings",
    "shareholders equity", "current assets", "current liabilities",
    "total assets", "total liabilities", "depreciation", "amortization",
  ];
  const financialHits = financialSignals.filter(s => lower.includes(s)).length;
  if (financialHits >= 2) {
    console.log(`⚡ Pre-detected: financial_report (${financialHits} signals)`);
    return {
      type: "financial_report", confidence: "high",
      keyTopics: ["Revenue Analysis", "Profitability", "Balance Sheet", "Cost Structure", "Financial Position"],
      primaryLanguage: "English", dataRichness: "high",
      hasTabularData: true, hasCharts: false,
      suggestedSlideTypes: ["kpi", "chart", "twoColumn", "bullets", "scorecard"],
      documentTitle: extractDocumentTitle(text),
      estimatedAudience: "Finance Team / Executive Leadership",
    };
  }

  // Banking detection — requires STRONG signals specific to bank statements
  const strongBankingSignals = [
    "account statement", "savings account", "current account", "checking account",
    "upi/", "neft", "imps", "ifsc", "micr", "chq/ref",
    "bank statement", "withdrawal (dr.)", "deposit (cr.)",
    "opening balance",
  ];
  const strongHits = strongBankingSignals.filter(s => lower.includes(s)).length;
  if (strongHits >= 2) {
    console.log(`⚡ Pre-detected: banking (${strongHits} strong signals)`);
    return {
      type: "banking", confidence: "high",
      keyTopics: ["Account Transactions", "Balance Summary", "UPI Payments", "NEFT Transfers", "Spending Categories"],
      primaryLanguage: "English", dataRichness: "high",
      hasTabularData: true, hasCharts: false,
      suggestedSlideTypes: ["kpi", "chart", "bullets", "twoColumn", "scorecard"],
      documentTitle: extractBankingTitle(text),
      estimatedAudience: "Account Holder / Financial Analyst",
    };
  }

  // Healthcare detection
  const healthSignals = [
    "screening", "confirmed cases", "surgery", "medical", "health",
    "patient", "disease", "diagnosis", "treatment", "hospital",
    "rbsk", "congenital", "blindness", "hearing", "neural",
  ];
  const healthHits = healthSignals.filter(s => lower.includes(s)).length;
  if (healthHits >= 4) {
    console.log(`⚡ Pre-detected: healthcare_data (${healthHits} signals)`);
    return {
      type: "healthcare_data", confidence: "high",
      keyTopics: ["Screening Coverage", "Case Confirmation", "Medical Management", "Surgical Outcomes", "Gap Analysis"],
      primaryLanguage: "English", dataRichness: "high",
      hasTabularData: true, hasCharts: true,
      suggestedSlideTypes: ["kpi", "chart", "twoColumn", "bullets", "scorecard"],
      documentTitle: extractDocumentTitle(text),
      estimatedAudience: "Healthcare Officials / Government Administrators",
    };
  }

  return null;
}

function extractBankingTitle(text) {
  const nameMatch = text.match(/([A-Z][A-Z\s]{5,40})\s*\n/);
  const periodMatch = text.match(/(\d{1,2}\s+\w+\s+\d{4})\s*[-–to]+\s*(\d{1,2}\s+\w+\s+\d{4})/i);
  const bankMatch = text.match(/(kotak|hdfc|sbi|icici|axis|yes bank|idbi|pnb|bob|kotak mahindra)/i);
  const name = nameMatch ? nameMatch[1].trim() : "Account Holder";
  const bank = bankMatch ? bankMatch[1].replace(/\b\w/g, c => c.toUpperCase()) : "Bank";
  const period = periodMatch ? ` — ${periodMatch[1]} to ${periodMatch[2]}` : "";
  return `${bank} Account Statement${period}`;
}

function extractDocumentTitle(text) {
  const firstLine = text.split("\n").find(l => l.trim().length > 10 && l.trim().length < 100);
  return firstLine ? firstLine.trim().slice(0, 80) : "Document Analysis";
}

// ── Image document handler ────────────────────────────────────────────────────

async function handleImageDocument(base64Data, mimeType, wizardOptions = {}) {
  const prompt = `Examine this image and extract ALL visible text, data, numbers, tables, and charts.
Transcribe tables row by row. List every metric and statistic exactly as shown.
Return only the extracted content, nothing else.`;
  const imageText = await aiCallWithImage(prompt, base64Data, mimeType, 4096);
  return generatePresentationPlan(imageText, wizardOptions);
}

// ── Step 1: Detect document type ──────────────────────────────────────────────

async function detectDocumentType(documentText) {
  const preDetected = preDetectDocumentType(documentText);
  if (preDetected) return preDetected;

  const sample = safeTruncate(documentText, 3000);
  const prompt = `Classify this document. Return ONLY a JSON object, no markdown.

Document:
"""
${sample}
"""

{"type":"banking|financial_report|research_paper|business_proposal|legal_contract|resume_cv|technical_doc|annual_report|medical_report|meeting_notes|educational_content|government_report|healthcare_data|sales_report|hr_document|marketing_report|project_plan|audit_report|policy_document|general","confidence":"high|medium|low","keyTopics":["t1","t2","t3","t4","t5"],"primaryLanguage":"English","dataRichness":"low|medium|high","hasTabularData":true,"hasCharts":false,"suggestedSlideTypes":["bullets","kpi","chart"],"documentTitle":"Title","estimatedAudience":"Audience"}`;

  try {
    const raw = await aiCall(prompt, 800);
    return parseJsonResponse(raw);
  } catch (e) {
    console.warn("detectDocumentType fallback:", e.message);
    return {
      type: "general", confidence: "low", keyTopics: [],
      primaryLanguage: "English", dataRichness: "medium",
      hasTabularData: false, hasCharts: false,
      suggestedSlideTypes: ["bullets", "kpi", "chart"],
      documentTitle: "Document", estimatedAudience: "General audience",
    };
  }
}

// ── Step 2: Build presentation strategy ───────────────────────────────────────

async function buildStrategy(documentText, docType, wizardOptions = {}) {
  const audience = wizardOptions.audience || docType.estimatedAudience || "General audience";
  const purpose = wizardOptions.purpose || "Inform and present key findings";
  const slideCount = parseInt(wizardOptions.slideCount) || 12;

  const narrativeByType = {
    banking: "Financial Position → Transaction Analysis → Income vs Spend → Key Patterns → Recommendations",
    financial_report: "Executive Summary → Revenue Analysis → Cost Structure → Profitability → Balance Sheet → Outlook",
    research_paper: "Background → Methodology → Findings → Analysis → Implications",
    business_proposal: "Problem → Solution → Value Proposition → ROI → Next Steps",
    legal_contract: "Overview → Obligations → Rights → Risk Clauses → Action Items",
    resume_cv: "Profile → Competencies → Career Highlights → Achievements → Value",
    technical_doc: "Overview → Architecture → Components → Implementation → Risks",
    annual_report: "Year in Review → Financial Highlights → Segments → Initiatives → Outlook",
    medical_report: "Population → Clinical Findings → Analysis → Treatment → Recommendations",
    meeting_notes: "Context → Agenda → Decisions → Action Items → Next Steps",
    educational_content: "Objectives → Concepts → Examples → Application → Summary",
    government_report: "Program Overview → Coverage → Metrics → Gap Analysis → Recommendations",
    healthcare_data: "Program Overview → Coverage Metrics → Condition Analysis → Gap Analysis → Recommendations",
    sales_report: "Performance → Revenue → Pipeline → Win/Loss → Action Plan",
    hr_document: "Workforce Overview → Metrics → Performance → Issues → Action Plan",
    marketing_report: "Campaign Overview → Metrics → Channel Analysis → Insights → Optimization",
    project_plan: "Overview → Scope → Timeline → Resources → Risks",
    audit_report: "Scope → Methodology → Findings → Risk Assessment → Recommendations",
    policy_document: "Overview → Rationale → Provisions → Implementation → Compliance",
    general: "Overview → Key Findings → Analysis → Insights → Recommendations",
  };
  const narrative = narrativeByType[docType.type] || narrativeByType.general;
  const docSample = safeTruncate(documentText, 6000);

  const prompt = `You are a senior analyst. Read this document and return a strategy JSON.
Keep ALL string values SHORT (under 80 chars). Return ONLY valid JSON with double-quoted keys.

DOC TYPE: ${docType.type} | AUDIENCE: ${audience} | PURPOSE: ${purpose} | SLIDES: ${slideCount}

Document:
"""
${docSample}
"""

{"presentationTitle":"<concise title max 60 chars>","executiveSummary":"<1-2 sentences max 120 chars>","keyMessages":["<finding+data max 60 chars>","<finding>","<finding>","<finding>","<finding>"],"narrativeFlow":"${narrative}","targetSlideCount":${slideCount},"includeCover":true,"includeAgenda":${slideCount > 6},"includeConclusion":true,"documentType":"${docType.type}","audience":"${audience}","tone":"professional","topQuantitativeFindings":["<exact stat>","<exact stat>","<exact stat>"],"mostImportantInsight":"<insight with data max 80 chars>","chartRecommendations":[{"slideTitle":"<title>","chartType":"bar","reason":"<why max 40 chars>"},{"slideTitle":"<title>","chartType":"pie","reason":"<why>"}]}`;

  let parsed = null;
  try {
    const raw = await aiCall(prompt, 4096);
    parsed = parseJsonResponse(raw);
  } catch (e) {
    console.warn("buildStrategy parse failed, trying partial extraction:", e.message);
    try {
      const raw2 = await aiCall(prompt, 4096);
      parsed = partialJsonExtract(raw2) || {};
    } catch {}
  }

  parsed = parsed || {};
  return {
    presentationTitle: parsed.presentationTitle || docType.documentTitle || "Document Analysis",
    executiveSummary: parsed.executiveSummary || "Key findings and insights from the document.",
    keyMessages: Array.isArray(parsed.keyMessages) && parsed.keyMessages.length > 0
      ? parsed.keyMessages : ["Key finding 1", "Key finding 2", "Key finding 3"],
    narrativeFlow: parsed.narrativeFlow || narrative,
    targetSlideCount: parsed.targetSlideCount || slideCount,
    includeCover: parsed.includeCover !== false,
    includeAgenda: parsed.includeAgenda !== false && slideCount > 6,
    includeConclusion: parsed.includeConclusion !== false,
    documentType: parsed.documentType || docType.type,
    audience: parsed.audience || audience,
    tone: parsed.tone || "professional",
    topQuantitativeFindings: Array.isArray(parsed.topQuantitativeFindings) ? parsed.topQuantitativeFindings : [],
    mostImportantInsight: parsed.mostImportantInsight || parsed.executiveSummary || "See document for key insight.",
    chartRecommendations: Array.isArray(parsed.chartRecommendations) ? parsed.chartRecommendations : [],
  };
}

// ── Outline sizing helper ──────────────────────────────────────────────────────
// BUG FIX: previously, the hardcoded outlines for banking/financial_report/
// healthcare_data were fixed-length arrays (8-9 items). `.slice(0, Math.min(targetTotal, N))`
// can only ever return AT MOST N items when the array itself only has N items,
// so requesting 12+ slides silently produced only 8-9. This helper makes the
// hardcoded outlines actually honor the requested slide count in both directions:
// trims if the pool is bigger than needed, and pads with extra analysis slides
// (inserted before the closing slide) if the pool is smaller than requested.
function fitOutlineToTarget(base, targetTotal) {
  if (!Array.isArray(base) || base.length === 0) return base;
  const closingIdx = base.findIndex(s => s.slideType === "closing");
  const closing = closingIdx >= 0 ? base[closingIdx] : base[base.length - 1];
  const core = closingIdx >= 0 ? base.slice(0, closingIdx) : base.slice(0, -1);

  let result;
  if (core.length + 1 >= targetTotal) {
    result = [...core.slice(0, Math.max(targetTotal - 1, 1)), closing];
  } else {
    const fillers = [
      { slideType: "bullets", title: "Additional Financial Observations", contentFocus: "Further insights from the document data", purpose: "Deep dive" },
      { slideType: "chart", title: "Supplementary Data View", contentFocus: "Additional chart derived from document figures", purpose: "Extra visualization" },
    ];
    const extra = [];
    let i = 0;
    while (core.length + extra.length + 1 < targetTotal) {
      const f = fillers[i % fillers.length];
      const suffix = i >= fillers.length ? ` ${Math.floor(i / fillers.length) + 1}` : "";
      extra.push({ ...f, title: `${f.title}${suffix}` });
      i++;
    }
    result = [...core, ...extra, closing];
  }
  return result.map((s, idx) => ({ ...s, slideNumber: idx + 1 }));
}

// ── Step 3: Build slide outline ───────────────────────────────────────────────

async function buildOutline(documentText, strategy, wizardOptions = {}) {
  const slideCount = strategy.targetSlideCount || 12;
  const targetTotal = Math.min(slideCount + 3, 20);

  const typeSlideTypes = {
    banking: ["kpi","chart","bullets","twoColumn","scorecard"],
    financial_report: ["kpi","chart","twoColumn","bullets","swot","scorecard"],
    research_paper: ["bullets","twoColumn","chart","quote","process"],
    business_proposal: ["bullets","kpi","twoColumn","swot","process"],
    legal_contract: ["bullets","twoColumn","timeline","scorecard"],
    resume_cv: ["kpi","bullets","twoColumn","scorecard"],
    technical_doc: ["bullets","chart","twoColumn","timeline","process"],
    annual_report: ["kpi","chart","bullets","twoColumn","scorecard"],
    medical_report: ["bullets","twoColumn","kpi","scorecard"],
    meeting_notes: ["bullets","timeline","twoColumn"],
    educational_content: ["bullets","chart","quote","twoColumn","process"],
    government_report: ["kpi","chart","twoColumn","bullets","scorecard"],
    healthcare_data: ["kpi","chart","twoColumn","bullets","scorecard"],
    government_report: ["kpi","chart","twoColumn","bullets","scorecard"],
    sales_report: ["kpi","chart","twoColumn","bullets","scorecard"],
    hr_document: ["kpi","chart","bullets","twoColumn"],
    marketing_report: ["kpi","chart","bullets","twoColumn"],
    project_plan: ["timeline","bullets","twoColumn","kpi","scorecard"],
    audit_report: ["bullets","twoColumn","kpi","scorecard"],
    policy_document: ["bullets","twoColumn","process"],
    general: ["bullets","twoColumn","chart","kpi"],
  };
  const preferredTypes = (typeSlideTypes[strategy.documentType] || typeSlideTypes.general).join(", ");

  // Banking: hardcoded reliable outline
  if (strategy.documentType === "banking") {
    const base = [
      { slideNumber:1, title:strategy.presentationTitle, slideType:"cover", contentFocus:"Account holder name, bank name, statement period", purpose:"Introduction" },
      { slideNumber:2, title:"Account Overview", slideType:"kpi", contentFocus:"Opening balance, closing balance, total credits, total debits, net change, cashback earned", purpose:"Financial snapshot" },
      { slideNumber:3, title:"Transaction Volume by Category", slideType:"chart", contentFocus:"Bar chart: Food/Dining, Fuel, Transfers, Utilities, Shopping, Travel counts", purpose:"Spending patterns" },
      { slideNumber:4, title:"Income vs Expenditure", slideType:"chart", contentFocus:"Donut chart: total credit sum vs total debit sum", purpose:"Cash flow balance" },
      { slideNumber:5, title:"Top Inflows vs Top Outflows", slideType:"twoColumn", contentFocus:"Left: 4 largest credits with amounts. Right: 4 largest debits with amounts", purpose:"Significant transactions" },
      { slideNumber:6, title:"Transaction Patterns & Observations", slideType:"bullets", contentFocus:"UPI count, NEFT count, recurring payees, cashback, balance trajectory", purpose:"Behavioral insights" },
      { slideNumber:7, title:"Financial Health Scorecard", slideType:"scorecard", contentFocus:"Savings Rate, Spending Discipline, Digital Adoption, Balance Stability, EMI Load", purpose:"Health summary" },
      { slideNumber:8, title:"Multi-Dimension Spending Radar", slideType:"chart", contentFocus:"Radar chart: Savings Rate, Digital Adoption, Spending Discipline, Balance Stability, EMI Load — scored 0-100", purpose:"Holistic financial profile" },
      { slideNumber:9, title:"Risk Analysis & Executive Insights", slideType:"riskCards", contentFocus:"Overdraft risk, high recurring debit risk, low balance buffer risk", purpose:"Risk flagging" },
      { slideNumber:10, title:"Strategic Recommendations", slideType:"recommendations", contentFocus:"Immediate, short-term and long-term actions to improve financial health", purpose:"Action plan" },
      { slideNumber:11, title:"Key Takeaways & Recommendations", slideType:"closing", contentFocus:"Top 3 insights and action items", purpose:"Close" },
    ];
    return fitOutlineToTarget(base, targetTotal);
  }

  // Financial report: hardcoded reliable outline — matches the "Executive P&L Review"
  // reference structure (agenda → exec summary → revenue/cost analysis → full P&L
  // detail → waterfall → scorecard → radar → risk cards → recommendations → close).
  if (strategy.documentType === "financial_report") {
    const base = [
      { slideNumber:1, title:strategy.presentationTitle, slideType:"cover", contentFocus:"Company name, period, report type, headline KPIs", purpose:"Introduction" },
      { slideNumber:2, title:"Presentation Agenda", slideType:"agenda", contentFocus:"Executive Summary, Revenue Analysis, Cost Structure, P&L Detail, Waterfall, Health Assessment, Risk Analysis, Recommendations", purpose:"Roadmap" },
      { slideNumber:3, title:"Executive Summary", slideType:"kpi", contentFocus:"Total income, total expenses, net profit, profit margin — exact figures with sub-labels (e.g. number of revenue streams)", purpose:"Key metrics snapshot" },
      { slideNumber:4, title:"Revenue Analysis — Income Breakdown", slideType:"chart", contentFocus:"Bar chart: each income line item with amount and % of total income", purpose:"Revenue composition" },
      { slideNumber:5, title:"Cost Structure Analysis — Expense Breakdown", slideType:"chart", contentFocus:"Bar or donut chart: each expense line item with amount and % of total expenses; call out the dominant cost driver", purpose:"Cost composition" },
      { slideNumber:6, title:"P&L Statement — Full Line-by-Line Detail", slideType:"twoColumn", contentFocus:"Left: every income line item with amount and %. Right: every expense line item with amount and %", purpose:"Complete P&L breakdown" },
      { slideNumber:7, title:"Balance Sheet Overview", slideType:"twoColumn", contentFocus:"Left: assets (current + non-current) with values, or note if not reported. Right: liabilities + equity with values", purpose:"Financial position" },
      { slideNumber:8, title:"Revenue-to-Profit Waterfall Analysis", slideType:"chart", contentFocus:"Waterfall chart: starting from total income, subtracting each major expense category down to net profit", purpose:"Visualize how income converts to profit" },
      { slideNumber:9, title:"Income vs Expense — Category Comparison", slideType:"chart", contentFocus:"Grouped bar or donut comparing total income vs total expenses by category", purpose:"Cash flow balance" },
      { slideNumber:10, title:"Key Financial Observations", slideType:"bullets", contentFocus:"Margins, ratios, concentration risk, notable line items from the statements", purpose:"Analysis" },
      { slideNumber:11, title:"Financial Health Assessment", slideType:"scorecard", contentFocus:"Net Profit Margin, Revenue Diversity, Cost Control, Liquidity, Solvency — scored with status (good/warning/critical) and a one-line comment each", purpose:"Health scorecard" },
      { slideNumber:12, title:"Multi-Dimension Financial Performance Radar", slideType:"chart", contentFocus:"Radar chart: Net Margin, Revenue Diversity, Cost Control, Program/Core Revenue, Operating Buffer — each scored 0-100", purpose:"Holistic performance view" },
      { slideNumber:13, title:"Risk Analysis & Executive Insights", slideType:"riskCards", contentFocus:"Top 3-4 financial risks (e.g. revenue concentration, thin margin, cost dominance) each with a severity level and a one-line explanation grounded in the document's numbers", purpose:"Risk flagging" },
      { slideNumber:14, title:"Strategic Recommendations", slideType:"recommendations", contentFocus:"Grouped into Immediate / Short-Term / Long-Term actions, each tied to a specific figure from the document", purpose:"Action plan" },
      { slideNumber:15, title:"Key Takeaways", slideType:"closing", contentFocus:"Top financial insights and recommendations", purpose:"Close" },
    ];
    return fitOutlineToTarget(base, targetTotal);
  }

  // Healthcare: hardcoded outline
  if (strategy.documentType === "healthcare_data") {
    const base = [
      { slideNumber:1, title:strategy.presentationTitle, slideType:"cover", contentFocus:"Program name, district, period", purpose:"Introduction" },
      { slideNumber:2, title:"Programme Overview", slideType:"kpi", contentFocus:"Expected cases, confirmed cases, medically managed, surgeries needed, surgery done, pending", purpose:"District totals" },
      { slideNumber:3, title:"Confirmed Cases by Condition", slideType:"chart", contentFocus:"Bar chart: cases confirmed per condition/disease, using every condition actually listed in the document's table (e.g. congenital heart disease, cleft lip, cataract, hearing/vision defects, neural tube defects — whichever appear)", purpose:"Condition breakdown" },
      { slideNumber:4, title:"Medical vs Surgical Management", slideType:"chart", contentFocus:"Grouped bar: medically managed vs surgery done per condition", purpose:"Management split" },
      { slideNumber:5, title:"Detection Gap Analysis", slideType:"twoColumn", contentFocus:"Left: Expected vs confirmed gap % per condition. Right: Surgery completion rate per condition", purpose:"Gap analysis" },
      { slideNumber:6, title:"Block-wise Coverage", slideType:"chart", contentFocus:"Bar chart: expected vs confirmed cases per block/geographic area, using every block actually listed in the document", purpose:"Geographic analysis" },
      { slideNumber:7, title:"AWC Screening Performance", slideType:"twoColumn", contentFocus:"Left: Blindness — AWC identified vs RBSK confirmed. Right: Hearing — AWC identified vs RBSK confirmed", purpose:"AWC analysis" },
      { slideNumber:8, title:"Recommendations Scorecard", slideType:"scorecard", contentFocus:"Close detection gap, complete pending surgeries, focus Vellore Corporation, strengthen AWC referral", purpose:"Action priorities" },
      { slideNumber:9, title:"Risk Analysis & Executive Insights", slideType:"riskCards", contentFocus:"Highest-gap blocks/conditions flagged as risks with severity and rationale", purpose:"Risk flagging" },
      { slideNumber:10, title:"Strategic Recommendations", slideType:"recommendations", contentFocus:"Immediate, short-term and long-term actions grouped by priority", purpose:"Action plan" },
      { slideNumber:11, title:"Key Takeaways", slideType:"closing", contentFocus:"Top 3 findings and next steps", purpose:"Close" },
    ];
    return fitOutlineToTarget(base, targetTotal);
  }

  // All other types: structure-only prompt
  const prompt = `Create a slide outline. Return ONLY a valid JSON array with double-quoted keys.

Presentation: "${strategy.presentationTitle}"
Narrative: ${strategy.narrativeFlow}
Type: ${strategy.documentType}
Key messages: ${(strategy.keyMessages || []).slice(0, 3).join(" | ")}
Target: ${targetTotal} slides
Allowed types: cover, section, bullets, kpi, chart, twoColumn, timeline, swot, quote, process, scorecard, closing
Preferred: ${preferredTypes}

Rules: First = "cover", Last = "closing", include kpi + chart if data present.

Return array of exactly ${targetTotal} objects:
[{"slideNumber":1,"title":"Title","slideType":"cover","contentFocus":"details","purpose":"why"}]`;

  try {
    const raw = await aiCall(prompt, 3000);
    const outline = parseJsonResponse(raw);
    if (!Array.isArray(outline) || outline.length === 0) throw new Error("Empty outline");
    console.log(`📐 Outline parsed OK: ${outline.length} slides`);
    return outline;
  } catch (e) {
    console.error("buildOutline fallback:", e.message);
    return [
      { slideNumber:1, title:strategy.presentationTitle, slideType:"cover", contentFocus:"Title", purpose:"Introduction" },
      { slideNumber:2, title:"Executive Summary", slideType:"bullets", contentFocus:"Document overview", purpose:"Context" },
      { slideNumber:3, title:"Key Metrics", slideType:"kpi", contentFocus:"Main numeric metrics", purpose:"Data snapshot" },
      { slideNumber:4, title:"Data Analysis", slideType:"chart", contentFocus:"Visual breakdown", purpose:"Visual insight" },
      { slideNumber:5, title:"Key Findings", slideType:"twoColumn", contentFocus:"Main findings comparison", purpose:"Analysis" },
      { slideNumber:6, title:"Recommendations", slideType:"bullets", contentFocus:"Action items", purpose:"Next steps" },
      { slideNumber:7, title:"Key Takeaways", slideType:"closing", contentFocus:"Summary", purpose:"Close" },
    ];
  }
}

// ── Step 4: Build full slide content ──────────────────────────────────────────

async function buildSlideContent(documentText, outline, strategy, wizardOptions = {}) {
  const speakerNotes = wizardOptions.speakerNotes !== "No";
  const contentDensity = wizardOptions.contentDensity || "Balanced";
  const bulletCount = contentDensity === "Concise" ? 4 : contentDensity === "Detailed" ? 8 : 6;
  const docSample = safeTruncate(documentText, 18000);

  const domainRules = {
    banking: `BANKING RULES: Extract EXACT values only.
- KPI values: use actual ₹ amounts (e.g. "₹10,972.49"). Never use "N/A" or "low".
- Opening Balance: from "Opening Balance" row. Closing Balance: final row or Account Summary.
- Total Credits: sum all Deposit column values. Total Debits: sum all Withdrawal column values.
- Net Change = Closing - Opening.
- Chart "Transaction Volume by Category": count rows per category by keyword in Description.
  Food: FRESH,BAKERY,BRIYANI,RESTAURANT,HOTEL,COFFEE,CAKE,SWEET,TEA,FOOD
  Fuel: FUEL,PETROL,PETROLEUM,FUELZ,FUELS
  Transfers: NEFT or UPI to named individuals
  Utilities: JIO,AIRTEL,TV,RECHARGE,PREPAID,ELECTRICITY
  Shopping: STORE,SHOP,MART,TEXTILES
  Travel: RAILWAYS,RAPIDO,REDBUS,OLA,TOLL
- Chart "Income vs Expenditure": labels=["Total Credits","Total Debits"], values=[sum,sum]`,

    financial_report: `FINANCIAL REPORT RULES: Extract EXACT values only.
- KPI values: use actual currency amounts from the document.
- Revenue, Gross Profit, Net Profit/Loss: exact figures from P&L statement.
- Total Assets, Total Liabilities, Equity: exact figures from Balance Sheet.
- For P&L twoColumn: Left = all income line items with amounts, Right = all expense line items with amounts.
- For Balance Sheet twoColumn: Left = assets breakdown, Right = liabilities + equity breakdown.
- Chart values must be actual numbers from the document.
- For the waterfall chart: chartData.type="waterfall", labels/values are ordered steps from total income down through each major expense to net profit (positive = adds, negative = subtracts).
- For the radar chart: chartData.type="radar", 4-6 dimensions (e.g. Net Margin, Revenue Diversity, Cost Control, Operating Buffer) each scored 0-100 based on the actual figures.
- For riskCards: 3-4 real risks grounded in the numbers (e.g. revenue concentration %, margin thinness), each with severity critical|high|medium|low.
- For recommendations: group into immediate|short-term|long-term, each tied to a specific figure from the document.`,

    healthcare_data: `HEALTHCARE RULES: Extract EXACT values only from the tables in THIS document — never reuse figures from any other report.
- Expected Cases, Children Confirmed, Medically Managed, Surgery Done, Surgery Pending: read from the district/block totals table in this document.
- Per-condition breakdown: extract each disease/condition row exactly as listed in this document's table (do not assume which conditions are present — use the condition names and figures actually in the data).
- Per-block/geographic breakdown: extract each block/area row exactly as listed in this document's table.
- Detection gap % = (Expected − Confirmed) / Expected × 100, computed from this document's own numbers.
- Do NOT perform or show arithmetic verification, running totals, or step-by-step checking in the output — just extract the figures directly into the JSON fields. Any reasoning must happen silently; the response must be valid JSON only, with no explanatory text before, after, or between JSON objects.
- If a number does not evenly sum to a total in the source table, use the figures as given rather than trying to reconcile the discrepancy.`,
  };

  const extraRules = domainRules[strategy.documentType] || "";

  async function generateBatch(batchOutline) {
    const prompt = `You are a McKinsey analyst. Generate slide content from REAL document data only.
NEVER invent numbers. Use exact values from the document. Return valid JSON array, double-quoted keys.
CRITICAL: Keep ALL string values SHORT — subtitle max 60 chars, speakerNotes max 120 chars, bullet items max 100 chars. Never write long paragraphs inside JSON strings.

DOC TYPE: ${strategy.documentType} | AUDIENCE: ${strategy.audience}
BULLETS/SLIDE: up to ${bulletCount} | NOTES: ${speakerNotes}
${extraRules}

SLIDES TO GENERATE:
${JSON.stringify(batchOutline, null, 2)}

DOCUMENT:
"""
${docSample}
"""

Return JSON array of ${batchOutline.length} objects. Schemas:
cover: {"slideType":"cover","title":"","subtitle":"","documentTypeLabel":"","speakerNotes":""}
closing: {"slideType":"closing","title":"","body":"","keyMessages":["","",""],"speakerNotes":""}
section: {"slideType":"section","title":"","subtitle":"","speakerNotes":""}
bullets: {"slideType":"bullets","title":"","icon":"","bullets":["finding + so what"],"body":"","speakerNotes":""}
kpi: {"slideType":"kpi","title":"","icon":"📊","metrics":[{"label":"LABEL","value":"EXACT VALUE","trend":"up|down|neutral"}],"speakerNotes":""}
chart: {"slideType":"chart","title":"","icon":"📈","chartData":{"type":"bar|line|pie|donut","title":"","labels":["l1"],"values":[123]},"bullets":["insight"],"speakerNotes":""}
twoColumn: {"slideType":"twoColumn","title":"","icon":"","twoColumns":{"left":{"title":"","bullets":[""]},"right":{"title":"","bullets":[""]}},"speakerNotes":""}
swot: {"slideType":"swot","title":"","icon":"🔍","swotData":{"strengths":[""],"weaknesses":[""],"opportunities":[""],"threats":[""]},"speakerNotes":""}
timeline: {"slideType":"timeline","title":"","icon":"📅","timeline":[{"date":"","event":"","detail":""}],"speakerNotes":""}
process: {"slideType":"process","title":"","icon":"⚙️","steps":[{"number":1,"title":"","description":"","icon":""}],"speakerNotes":""}
scorecard: {"slideType":"scorecard","title":"","icon":"📋","items":[{"category":"","score":7,"maxScore":10,"status":"good|warning|critical","comment":""}],"speakerNotes":""}
agenda: {"slideType":"agenda","title":"","subtitle":"","sections":[{"icon":"","title":"","description":""}],"speakerNotes":""}
riskCards: {"slideType":"riskCards","title":"","icon":"⚠️","risks":[{"severity":"critical|high|medium|low","title":"","description":""}],"speakerNotes":""}
recommendations: {"slideType":"recommendations","title":"","icon":"🎯","items":[{"priority":"immediate|short-term|long-term","title":"","description":""}],"speakerNotes":""}`;

    const raw = await aiCall(prompt, 8192);
    try {
      return parseJsonResponse(raw);
    } catch (parseErr) {
      // Try extracting whatever complete objects we got before truncation
      const partial = extractCompleteObjects(raw) || extractCompleteObjects(repairJsonString(raw));
      if (partial && partial.length > 0) {
        console.warn(`⚠️  Batch truncated — recovered ${partial.length}/${batchOutline.length} slides`);
        // Fill missing slides with outline fallbacks
        const filled = batchOutline.map((outlineSlide, i) => {
          const found = partial.find(p => p.title === outlineSlide.title || p.slideType === outlineSlide.slideType);
          return found || {
            slideType: outlineSlide.slideType, title: outlineSlide.title, icon: "📄",
            bullets: [outlineSlide.contentFocus, outlineSlide.purpose].filter(Boolean),
            body: outlineSlide.contentFocus, speakerNotes: outlineSlide.purpose,
          };
        });
        return filled;
      }
      throw parseErr;
    }
  }

  try {
    if (outline.length <= 8) return await generateBatch(outline);
    const half = Math.ceil(outline.length / 2);
    console.log(`📦 Batching: ${half} + ${outline.length - half} slides`);
    const [s1, s2] = await Promise.all([generateBatch(outline.slice(0, half)), generateBatch(outline.slice(half))]);
    return [...s1, ...s2];
  } catch (e) {
    console.error("buildSlideContent fallback:", e.message);
    // Last resort: generate one slide at a time
    console.log("⚠️  Attempting per-slide fallback generation…");
    const results = [];
    for (const slideOutline of outline) {
      try {
        const single = await generateBatch([slideOutline]);
        results.push(...(Array.isArray(single) ? single : [single]));
      } catch {
        results.push({
          slideType: slideOutline.slideType, title: slideOutline.title, icon: "📄",
          bullets: [slideOutline.contentFocus, slideOutline.purpose].filter(Boolean),
          body: slideOutline.contentFocus, speakerNotes: slideOutline.purpose,
        });
      }
    }
    return results;
  }
}

// ── Post-processing validation ─────────────────────────────────────────────────

function validateAndRepairSlides(slides, strategy, docType) {
  if (!Array.isArray(slides)) return [];
  const repaired = slides.map(slide => {
    if (!slide || typeof slide !== "object") return null;
    if (slide.slideType === "kpi" && Array.isArray(slide.metrics)) {
      slide.metrics = slide.metrics.filter(m => {
        const val = String(m.value || "");
        return val.length >= 1 && !["n/a","tbd",""].includes(val.toLowerCase());
      });
      if (slide.metrics.length === 0) {
        slide.slideType = "bullets";
        slide.bullets = strategy.topQuantitativeFindings?.length ? strategy.topQuantitativeFindings : ["See document for key metrics"];
      }
    }
    if (slide.slideType === "chart" && slide.chartData) {
      const { labels, values } = slide.chartData;
      if (Array.isArray(values)) {
        const validPairs = (labels || []).map((l, i) => ({ l, v: values[i] }))
          .filter(({ v }) => typeof v === "number" && !isNaN(v) && isFinite(v) && v !== 0);
        slide.chartData.labels = validPairs.map(p => p.l);
        slide.chartData.values = validPairs.map(p => p.v);
        if (slide.chartData.values.length < 2) {
          slide.slideType = "bullets";
          slide.bullets = slide.bullets?.length ? slide.bullets : ["Insufficient chart data — see document"];
        }
      }
    }
    if (slide.slideType === "scorecard" && Array.isArray(slide.items)) {
      slide.items = slide.items.map(item => ({
        ...item,
        score: typeof item.score === "number" ? item.score : 5,
        maxScore: typeof item.maxScore === "number" ? item.maxScore : 10,
        status: ["good","warning","critical"].includes(item.status) ? item.status : "warning",
      }));
    }
    if (slide.slideType === "riskCards") {
      if (!Array.isArray(slide.risks) || slide.risks.length === 0) {
        slide.slideType = "bullets";
        slide.bullets = strategy.topQuantitativeFindings?.length ? strategy.topQuantitativeFindings : ["See document for risk factors"];
      } else {
        slide.risks = slide.risks.slice(0, 5).map(r => ({
          ...r,
          severity: ["critical","high","medium","low"].includes(r.severity) ? r.severity : "medium",
        }));
      }
    }
    if (slide.slideType === "recommendations") {
      if (!Array.isArray(slide.items) || slide.items.length === 0) {
        slide.slideType = "bullets";
        slide.bullets = strategy.keyMessages?.length ? strategy.keyMessages : ["See document for recommendations"];
      } else {
        slide.items = slide.items.slice(0, 6).map(it => ({
          ...it,
          priority: ["immediate","short-term","long-term"].includes(it.priority) ? it.priority : "short-term",
        }));
      }
    }
    if (slide.slideType === "agenda" && (!Array.isArray(slide.sections) || slide.sections.length === 0)) {
      slide.slideType = "bullets";
      slide.bullets = strategy.keyMessages?.length ? strategy.keyMessages : ["Overview", "Analysis", "Recommendations"];
    }
    return slide;
  }).filter(Boolean);

  if (!repaired[0] || repaired[0].slideType !== "cover") {
    repaired.unshift({
      slideType: "cover", title: strategy.presentationTitle,
      subtitle: strategy.executiveSummary,
      documentTypeLabel: (strategy.documentType || "DOCUMENT").replace(/_/g, " ").toUpperCase(),
    });
  }
  if (!repaired[repaired.length - 1] || repaired[repaired.length - 1].slideType !== "closing") {
    repaired.push({
      slideType: "closing", title: "Key Takeaways",
      body: strategy.mostImportantInsight || strategy.keyMessages?.[0] || "",
      keyMessages: strategy.keyMessages?.slice(0, 3) || [],
    });
  }
  return repaired;
}

// ── Main export ───────────────────────────────────────────────────────────────

async function generatePresentationPlan(documentText, wizardOptions = {}) {
  documentText = unwrapDocumentText(documentText);
  if (!documentText || documentText.trim().length < 50) {
    throw new Error("Document text is too short to generate a presentation.");
  }
  if (wizardOptions.isImage && wizardOptions.base64Data && wizardOptions.mimeType) {
    console.log("🖼️  Image document — running Vision analysis…");
    return handleImageDocument(wizardOptions.base64Data, wizardOptions.mimeType, wizardOptions);
  }

  console.log("🎯 Step 1: Detecting document type…");
  const docType = await detectDocumentType(documentText);
  console.log(`📄 Detected: ${docType.type} (${docType.confidence}) — dataRichness: ${docType.dataRichness}`);

  console.log("🧠 Step 2: Building presentation strategy…");
  const strategy = await buildStrategy(documentText, docType, wizardOptions);
  console.log(`📋 Strategy: "${strategy.presentationTitle}" — ${strategy.targetSlideCount} slides`);

  console.log("🗂️  Step 3: Building slide outline…");
  const outline = await buildOutline(documentText, strategy, wizardOptions);
  console.log(`📐 Outline: ${outline.length} slides`);

  console.log("✍️  Step 4: Generating slide content…");
  let slides;
  try {
    slides = await buildSlideContent(documentText, outline, strategy, wizardOptions);
    console.log(`✅ Generated ${slides.length} slides`);
  } catch (e) {
    console.error("Slide generation failed, using fallback:", e.message);
    slides = outline.map(s => ({
      slideType: s.slideType, title: s.title, icon: "📄",
      bullets: [s.contentFocus, s.purpose].filter(Boolean),
      body: s.contentFocus, speakerNotes: s.purpose,
    }));
  }

  if (!Array.isArray(slides) || slides.length === 0) {
    throw new Error("AI failed to generate slide content. Please try again.");
  }

  slides = validateAndRepairSlides(slides, strategy, docType);
  console.log(`✅ Final: ${slides.length} slides`);
  return { strategy, outline, slides };
}

module.exports = { generatePresentationPlan };