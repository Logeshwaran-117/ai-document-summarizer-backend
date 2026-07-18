/**
 * presentationAiService.js
 *
 * AI Presentation Engine — reads the ORIGINAL document directly.
 * Does NOT use pre-generated summaries. Runs a dedicated prompt
 * pipeline to analyse the raw text and produce a fully-structured
 * slide plan for buildAIDeck() in pptRoutes.js.
 *
 * Pipeline:
 *   1. detectDocumentType()  — classify the doc (banking, research, legal, …)
 *   2. buildStrategy()       — audience, tone, key messages, slide count
 *   3. buildOutline()        — section headers + types
 *   4. buildSlides()         — full slide objects with bullets/metrics/charts
 */

const { callWithRotation } = require("./geminiService");

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Truncate text so we stay well within Gemini's context window */
function safeTruncate(text, maxChars = 80000) {
  if (text.length <= maxChars) return text;
  const half = Math.floor(maxChars / 2);
  return (
    text.slice(0, half) +
    "\n\n[... document middle truncated for context window ...]\n\n" +
    text.slice(-half)
  );
}

/** Strip ```json fences and parse safely */
function parseJsonResponse(raw) {
  const cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  return JSON.parse(cleaned);
}

/** Call Gemini with a text-only prompt */
async function aiCall(prompt, maxTokens = 8192) {
  return callWithRotation(
    () => [{ text: prompt }],
    maxTokens,
    "gemini-3.5-flash",
    null,
    "summarize"
  );
}

// ── Step 1: Detect document type ──────────────────────────────────────────────

async function detectDocumentType(documentText) {
  const sample = documentText.slice(0, 3000);

  const prompt = `You are a document classifier. Read this document excerpt and return ONLY a JSON object (no markdown, no explanation).

Document excerpt:
"""
${sample}
"""

Return exactly this JSON:
{
  "type": "<one of: banking|research|business|legal|resume|technical|annual_report|medical|meeting|educational|general>",
  "confidence": "<high|medium|low>",
  "keyTopics": ["topic1", "topic2", "topic3"],
  "audience": "<who would read this document>",
  "documentTitle": "<best guess at document title from content>"
}`;

  try {
    const raw = await aiCall(prompt, 512);
    return parseJsonResponse(raw);
  } catch {
    return {
      type: "general",
      confidence: "low",
      keyTopics: [],
      audience: "General audience",
      documentTitle: "Document",
    };
  }
}

// ── Step 2: Build presentation strategy ───────────────────────────────────────

async function buildStrategy(documentText, docType, wizardOptions = {}) {
  const truncated = safeTruncate(documentText, 60000);

  const audience = wizardOptions.audience || docType.audience || "General audience";
  const purpose = wizardOptions.purpose || "Inform and present key findings";
  const slideCount = parseInt(wizardOptions.slideCount) || 12;
  const contentDensity = wizardOptions.contentDensity || "Balanced";

  const typeInstructions = {
    banking: "Focus on financial analytics: income vs expenses, cash flow, transaction categories, spending patterns, financial health. Include actual calculated figures.",
    research: "Structure as: Problem → Methodology → Data/Findings → Analysis → Conclusion. Highlight key discoveries.",
    business: "Extract KPIs, trends, risks, opportunities, strategic recommendations. Use executive framing.",
    legal: "Highlight key clauses, obligations, rights, deadlines, risks, and required actions.",
    resume: "Present professional profile, core competencies, career highlights, key achievements.",
    technical: "Cover architecture, workflow, implementation details, technical specs, and key decisions.",
    annual_report: "Focus on revenue, expenses, growth metrics, strategic initiatives, and outlook.",
    medical: "Present diagnosis/findings, key observations, treatment notes, and recommendations.",
    meeting: "Extract agenda items, decisions made, action items, owners, and deadlines.",
    educational: "Explain core concepts, provide examples, build understanding progressively.",
    general: "Identify the main purpose, key messages, supporting evidence, and conclusions.",
  };

  const instructions = typeInstructions[docType.type] || typeInstructions.general;

  const prompt = `You are a McKinsey-level presentation strategist. Analyse this COMPLETE document and create a presentation strategy.

Document Type: ${docType.type}
Audience: ${audience}
Purpose: ${purpose}
Target Slide Count: ${slideCount}
Content Density: ${contentDensity}

Special Instructions for this document type: ${instructions}

COMPLETE DOCUMENT:
"""
${truncated}
"""

Return ONLY a JSON object (no markdown fences, no explanation):
{
  "presentationTitle": "<compelling title derived from document content>",
  "executiveSummary": "<2-3 sentence summary of what this presentation covers>",
  "keyMessages": ["<key message 1>", "<key message 2>", "<key message 3>"],
  "narrativeFlow": "<describe the story arc: e.g. 'Problem → Evidence → Analysis → Recommendation'>",
  "targetSlideCount": ${slideCount},
  "includeCover": true,
  "includeAgenda": <true if ${slideCount} > 6>,
  "includeConclusion": true,
  "documentType": "${docType.type}",
  "audience": "${audience}",
  "tone": "<professional|analytical|executive|educational|technical>"
}`;

  try {
    const raw = await aiCall(prompt, 1024);
    return parseJsonResponse(raw);
  } catch {
    return {
      presentationTitle: docType.documentTitle || "Document Analysis",
      executiveSummary: "Key findings and insights from the document.",
      keyMessages: ["Key finding 1", "Key finding 2", "Key finding 3"],
      narrativeFlow: "Overview → Analysis → Insights → Conclusion",
      targetSlideCount: slideCount,
      includeCover: true,
      includeAgenda: slideCount > 6,
      includeConclusion: true,
      documentType: docType.type,
      audience,
      tone: "professional",
    };
  }
}

// ── Step 3: Build slide outline ───────────────────────────────────────────────

async function buildOutline(documentText, strategy, wizardOptions = {}) {
  const truncated = safeTruncate(documentText, 70000);
  const slideCount = strategy.targetSlideCount || 12;

  // Decide which slide types to emphasize based on document type
  const typeSlideTypes = {
    banking: ["kpi", "chart", "bullets", "twoColumn", "timeline"],
    research: ["bullets", "twoColumn", "chart", "quote"],
    business: ["kpi", "chart", "bullets", "swot", "twoColumn"],
    legal: ["bullets", "twoColumn", "timeline"],
    resume: ["kpi", "bullets", "twoColumn"],
    technical: ["bullets", "chart", "twoColumn", "timeline"],
    annual_report: ["kpi", "chart", "bullets", "twoColumn"],
    medical: ["bullets", "twoColumn", "kpi"],
    meeting: ["bullets", "timeline", "twoColumn"],
    educational: ["bullets", "chart", "quote", "twoColumn"],
    general: ["bullets", "twoColumn", "chart"],
  };

  const preferredTypes = (typeSlideTypes[strategy.documentType] || typeSlideTypes.general).join(", ");

  const prompt = `You are a senior presentation designer. Based on this complete document, create a precise slide outline.

Strategy:
- Title: ${strategy.presentationTitle}
- Narrative: ${strategy.narrativeFlow}
- Audience: ${strategy.audience}
- Tone: ${strategy.tone}
- Document Type: ${strategy.documentType}

Target: ${slideCount} content slides (plus cover and closing).
Preferred slide types: ${preferredTypes}

COMPLETE DOCUMENT:
"""
${truncated}
"""

Create a slide outline extracting REAL content from the document.
Return ONLY a JSON array (no markdown, no explanation):
[
  {
    "slideNumber": 1,
    "title": "<slide title>",
    "slideType": "<cover|section|bullets|kpi|chart|twoColumn|timeline|swot|quote|closing>",
    "contentFocus": "<what specific content from the document goes here>",
    "purpose": "<what this slide communicates to the audience>"
  }
]

Rules:
- Slide 1 MUST be type "cover"
- Last slide MUST be type "closing"
- Include 1-2 "section" divider slides if there are logical groupings
- Use "kpi" for slides with 3-6 key metrics/numbers
- Use "chart" for slides with data suitable for bar/line/pie charts
- Use "swot" only for genuine strength/weakness/opportunity/threat content
- Use "timeline" for chronological or sequential content
- Use "twoColumn" for comparisons or two related topics
- Extract REAL section topics from the document — do not invent generic headings
- Total slide count including cover and closing: ${Math.min(slideCount + 4, 20)}`;

  try {
    const raw = await aiCall(prompt, 2048);
    return parseJsonResponse(raw);
  } catch (e) {
    console.error("Outline build failed:", e.message);
    return [
      { slideNumber: 1, title: strategy.presentationTitle, slideType: "cover", contentFocus: "Title", purpose: "Introduction" },
      { slideNumber: 2, title: "Overview", slideType: "bullets", contentFocus: "Document overview", purpose: "Set context" },
      { slideNumber: 3, title: "Key Findings", slideType: "bullets", contentFocus: "Main findings", purpose: "Core content" },
      { slideNumber: 4, title: "Analysis", slideType: "twoColumn", contentFocus: "Analysis", purpose: "Deep dive" },
      { slideNumber: 5, title: "Conclusion", slideType: "closing", contentFocus: "Summary", purpose: "Close" },
    ];
  }
}

// ── Step 4: Build full slide content ──────────────────────────────────────────

async function buildSlideContent(documentText, outline, strategy, wizardOptions = {}) {
  const truncated = safeTruncate(documentText, 65000);
  const speakerNotes = wizardOptions.speakerNotes !== "No";
  const contentDensity = wizardOptions.contentDensity || "Balanced";

  const bulletCount = contentDensity === "Concise" ? 4 : contentDensity === "Detailed" ? 8 : 6;

  const outlineJson = JSON.stringify(outline, null, 2);

  const prompt = `You are a world-class presentation content writer with deep expertise in ${strategy.documentType} documents.

Read this COMPLETE document and generate detailed slide content for EVERY slide in the outline.
Extract REAL data, quotes, metrics, and facts from the document — do not hallucinate or invent content.

Document Type: ${strategy.documentType}
Audience: ${strategy.audience}
Tone: ${strategy.tone}
Bullets per slide: up to ${bulletCount}
Speaker notes: ${speakerNotes}

Slide Outline:
${outlineJson}

COMPLETE DOCUMENT:
"""
${truncated}
"""

Return ONLY a JSON array with one object per slide (no markdown fences, no explanation).
Each slide object must follow this exact schema:

For "cover" slide:
{ "slideType": "cover", "title": "<title>", "subtitle": "<subtitle from doc>", "speakerNotes": "<notes if enabled>" }

For "closing" slide:
{ "slideType": "closing", "title": "Thank You", "body": "<key takeaway from document>", "speakerNotes": "<notes if enabled>" }

For "section" slide:
{ "slideType": "section", "title": "<section name>", "subtitle": "<brief description>", "speakerNotes": "<notes if enabled>" }

For "bullets" slide:
{ "slideType": "bullets", "title": "<title>", "icon": "<emoji>", "bullets": ["<bullet 1>", "..."], "body": "<key insight from document>", "speakerNotes": "<notes if enabled>" }

For "kpi" slide:
{ "slideType": "kpi", "title": "<title>", "icon": "📊", "metrics": [{"label": "<metric name>", "value": "<actual value from document>"}], "speakerNotes": "<notes if enabled>" }

For "chart" slide:
{ "slideType": "chart", "title": "<title>", "icon": "📈", "chartData": {"type": "<bar|line|pie|donut>", "title": "<chart title>", "labels": ["<label1>", "..."], "values": [<number1>, ...]}, "bullets": ["<key insight>"], "speakerNotes": "<notes if enabled>" }

For "twoColumn" slide:
{ "slideType": "twoColumn", "title": "<title>", "icon": "⚖️", "twoColumns": {"left": {"title": "<left heading>", "bullets": ["<item>", "..."]}, "right": {"title": "<right heading>", "bullets": ["<item>", "..."]}}, "speakerNotes": "<notes if enabled>" }

For "swot" slide:
{ "slideType": "swot", "title": "SWOT Analysis", "icon": "🔍", "swotData": {"strengths": ["<s1>", "..."], "weaknesses": ["<w1>", "..."], "opportunities": ["<o1>", "..."], "threats": ["<t1>", "..."]}, "speakerNotes": "<notes if enabled>" }

For "timeline" slide:
{ "slideType": "timeline", "title": "<title>", "icon": "📅", "timeline": [{"date": "<date/period>", "event": "<event name>", "detail": "<brief detail>"}], "speakerNotes": "<notes if enabled>" }

For "quote" slide:
{ "slideType": "quote", "title": "<title>", "icon": "💬", "quote": {"text": "<exact quote or key statement from document>", "attribution": "<source/author if available>"}, "speakerNotes": "<notes if enabled>" }

Critical rules:
- All values MUST come from the actual document content
- For kpi slides: extract real numbers, percentages, amounts from the document
- For chart slides: use real data points from the document; values array must contain numbers only
- For bullets: write concise, insight-driven points — not vague generalities
- Speaker notes: explain what to say and why it matters to the audience
- Return an array with exactly ${outline.length} slide objects in the same order as the outline`;

  const raw = await aiCall(prompt, 8192);
  return parseJsonResponse(raw);
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Full pipeline: document text → structured slide data
 * @param {string} documentText   - raw extracted text from the document
 * @param {object} wizardOptions  - user options from the PPT wizard UI
 * @returns {{ strategy, outline, slides }}
 */
async function generatePresentationPlan(documentText, wizardOptions = {}) {
  if (!documentText || documentText.trim().length < 50) {
    throw new Error("Document text is too short to generate a presentation.");
  }

  console.log("🎯 Step 1: Detecting document type…");
  const docType = await detectDocumentType(documentText);
  console.log(`📄 Detected type: ${docType.type} (${docType.confidence} confidence)`);

  console.log("🧠 Step 2: Building presentation strategy…");
  const strategy = await buildStrategy(documentText, docType, wizardOptions);
  console.log(`📋 Strategy: "${strategy.presentationTitle}" — ${strategy.targetSlideCount} slides`);

  console.log("🗂️  Step 3: Building slide outline…");
  const outline = await buildOutline(documentText, strategy, wizardOptions);
  console.log(`📐 Outline: ${outline.length} slides planned`);

  console.log("✍️  Step 4: Generating slide content…");
  let slides;
  try {
    slides = await buildSlideContent(documentText, outline, strategy, wizardOptions);
    console.log(`✅ Generated ${slides.length} slides`);
  } catch (e) {
    console.error("Slide content generation failed, using outline fallback:", e.message);
    // Graceful fallback — convert outline to minimal slides
    slides = outline.map((s) => ({
      slideType: s.slideType,
      title: s.title,
      icon: "📄",
      bullets: [s.contentFocus, s.purpose].filter(Boolean),
      body: s.contentFocus,
      speakerNotes: s.purpose,
    }));
  }

  // Validate slides array
  if (!Array.isArray(slides) || slides.length === 0) {
    throw new Error("AI failed to generate slide content. Please try again.");
  }

  // Ensure first slide is cover, last is closing
  if (slides[0]?.slideType !== "cover") {
    slides.unshift({ slideType: "cover", title: strategy.presentationTitle, subtitle: strategy.executiveSummary });
  }
  if (slides[slides.length - 1]?.slideType !== "closing") {
    slides.push({ slideType: "closing", title: "Thank You", body: strategy.keyMessages?.[0] || "Thank you for your attention." });
  }

  return { strategy, outline, slides };
}

module.exports = { generatePresentationPlan };