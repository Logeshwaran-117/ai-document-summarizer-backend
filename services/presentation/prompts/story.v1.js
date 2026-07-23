/**
 * story.v1.js — Prompt template for Story & Narrative Arc Generator
 */

module.exports = function buildStoryPrompt(context) {
  return `You are a Chief Strategy Officer and presentation story architect.
Analyze this document and construct a high-impact narrative arc.
Keep ALL strings concise and data-driven. Return ONLY JSON.

DOC TYPE: ${context.documentType} | AUDIENCE: ${context.audience} | PURPOSE: ${context.purpose} | TARGET SLIDES: ${context.slideCount}

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
  "mostImportantInsight": "<Single core takeaway max 90 chars>"
}`;
};
