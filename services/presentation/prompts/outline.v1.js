/**
 * outline.v1.js — Prompt template for Slide Outline Generator
 */

module.exports = function buildOutlinePrompt(context, storyStrategy) {
  return `You are a presentation structure designer. Generate a slide-by-slide outline of EXACTLY ${context.slideCount} slides based on this story strategy.

TITLE: ${storyStrategy.presentationTitle}
SUMMARY: ${storyStrategy.executiveSummary}
NARRATIVE: ${storyStrategy.narrativeFlow}
DOC TYPE: ${context.documentType}

Return ONLY a JSON array of slide objects. Do not include markdown formatting outside JSON.

JSON SCHEMA REQUIRED:
[
  {
    "slideNumber": 1,
    "slideType": "title",
    "title": "${storyStrategy.presentationTitle}",
    "contentFocus": "Cover & presentation overview",
    "purpose": "Set context & orient audience"
  },
  {
    "slideNumber": 2,
    "slideType": "executiveSummary",
    "title": "Executive Summary",
    "contentFocus": "${storyStrategy.executiveSummary}",
    "purpose": "Deliver core message immediately"
  }
  ... (up to ${context.slideCount} slides including a final closing slide)
]`;
};
