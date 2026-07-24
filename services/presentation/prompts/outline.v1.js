/**
 * outline.v1.js — Prompt template for Slide Outline Generator
 */

module.exports = function buildOutlinePrompt(context, storyStrategy) {
  return `You are a presentation structure designer. Generate a slide-by-slide outline of EXACTLY ${context.slideCount} slides based on this story strategy.

TITLE: ${storyStrategy.presentationTitle}
SUMMARY: ${storyStrategy.executiveSummary}
NARRATIVE: ${storyStrategy.narrativeFlow}
DOC TYPE: ${context.documentType}

SUPPORTED SLIDE TYPES:
- cover (Slide 1 title slide)
- executiveSummary (Overview & high-level takeaway)
- kpi (6-card key performance indicator dashboard)
- chart (Data visualization: bar, line, pie, donut)
- twoColumn (Side-by-side comparison or before/after)
- swot (2x2 matrix: Strengths, Weaknesses, Opportunities, Threats)
- timeline (Horizontal timeline of chronological events)
- process (Step-by-step sequential workflow)
- scorecard (Metric performance evaluation with progress bars & status tags)
- recommendations (Numbered amber callout cards with strategic recommendations & next steps)
- quote (Hero quote / key takeaway)
- section (Section divider between main topics)
- closing (Final conclusion & thank you slide)

CRITICAL REQUIREMENT: Return a JSON array containing EXACTLY ${context.slideCount} slide objects numbered 1 to ${context.slideCount}.

EXAMPLE SCHEMA FORMAT:
[
  {
    "slideNumber": 1,
    "slideType": "cover",
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
]`;
};
