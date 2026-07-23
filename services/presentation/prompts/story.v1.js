/**
 * story.v1.js — Prompt template for Story & Narrative Arc Generator
 */

const DOMAIN_RULES = {
  banking: `BANKING RULES: Extract exact balance amounts, transaction volume numbers, interest rates, and fee figures. Every bullet must include a specific transaction type, account type, or currency value from the document.`,
  financial_report: `FINANCIAL RULES: Extract exact revenue, net profit, EBITDA, margins, and growth percentages. Rounding is forbidden. Every financial figure must name the reporting period (e.g., Q3 2025, FY24).`,
  healthcare_data: `HEALTHCARE RULES: Extract exact patient counts, screening statistics, surgery figures, and program names. Distinguish between total screened vs surgically treated. Include block/district breakdowns if present.`,
  research_paper: `RESEARCH RULES: Extract the actual methodology, sample size, and findings with p-values or percentages. Never summarize vaguely. Every bullet must name the specific variable studied and its measured outcome.`,
  business_proposal: `PROPOSAL RULES: Every KPI must be a ROI figure, cost saving, or revenue projection from the document. The twoColumn slide must have exact before/after or problem/solution pairs from the text.`,
  annual_report: `ANNUAL REPORT RULES: Extract exact fiscal year numbers for revenue, profit, and growth %. Segment data must use the document's own segment names. Never round numbers.`,
  government_report: `GOVT REPORT RULES: Use exact district/block/program names from the document. Coverage percentages must be calculated from the document's raw numbers, not estimated.`,
  general: `GENERAL RULES: Every bullet must include a specific fact, number, name, or date from the document. Never write generic observations. If you cannot find data, reference the exact section rather than inventing placeholders.`,
};

module.exports = function buildStoryPrompt(context) {
  const domainRule = DOMAIN_RULES[context.documentType] || DOMAIN_RULES.general;

  return `You are a Chief Strategy Officer and McKinsey-grade presentation story architect.
Analyze this document and construct a high-impact narrative arc.
Keep ALL strings concise and data-driven. Return ONLY JSON.

DOC TYPE: ${context.documentType} | AUDIENCE: ${context.audience} | PURPOSE: ${context.purpose} | TARGET SLIDES: ${context.slideCount}

DOMAIN GUIDELINES:
${domainRule}

DOCUMENT SAMPLE:
"""
${context.documentSample}
"""

JSON SCHEMA REQUIRED:
{
  "presentationTitle": "<High-impact main title max 60 chars>",
  "executiveSummary": "<Concise 1-2 sentence executive summary max 140 chars>",
  "keyMessages": [
    "<Key Finding 1 with data point max 70 chars>",
    "<Key Finding 2 with data point max 70 chars>",
    "<Key Finding 3 with data point max 70 chars>"
  ],
  "narrativeFlow": "<Section 1 -> Section 2 -> Section 3 -> Section 4>",
  "targetSlideCount": ${context.slideCount},
  "audience": "${context.audience}",
  "tone": "${context.tone}",
  "topQuantitativeFindings": ["<Stat 1>", "<Stat 2>", "<Stat 3>"],
  "mostImportantInsight": "<Single core takeaway max 90 chars>",
  "slideNarrativeMap": [
    {
      "slideNumber": 1,
      "narrativePurpose": "Establish the scale — shock with total volume number",
      "emotionalTone": "authoritative"
    },
    {
      "slideNumber": 2,
      "narrativePurpose": "Deliver core executive summary and quantitative findings",
      "emotionalTone": "analytical"
    }
  ]
}`;
};
