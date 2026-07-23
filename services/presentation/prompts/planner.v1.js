/**
 * planner.v1.js — Prompt template for Detailed Slide Content & Layout Planner
 */

module.exports = function buildPlannerPrompt(context, storyStrategy, outline) {
  const outlineStr = JSON.stringify(outline, null, 2);
  const narrativeMapStr = storyStrategy.slideNarrativeMap ? JSON.stringify(storyStrategy.slideNarrativeMap, null, 2) : "[]";
  
  return `You are an elite McKinsey slide presentation designer. Create rich, detailed slide content for each slide in the outline below.
Extract EXACT metrics, numbers, structured bullet points, card structures, tables, and charts from the document text.
AVOID generic placeholder text. Every bullet must contain concrete facts and findings.

DOCUMENT TEXT:
"""
${context.documentSample}
"""

PRESENTATION NARRATIVE MAP:
${narrativeMapStr}

OUTLINE TO PLAN:
${outlineStr}

Return ONLY a JSON array of slide content objects matching the schema below:

JSON SCHEMA REQUIRED:
[
  {
    "slideNumber": 1,
    "slideType": "cover|executiveSummary|twoColumn|process|scorecard|kpi|timeline|chart|recommendations|swot|quote|section|closing",
    "headline": "<Action Headline summarizing key insight max 70 chars>",
    "subtitle": "<Subheading context max 90 chars>",
    "keyInsight": "<Key strategic takeaway max 120 chars>",
    "bullets": ["<Finding 1 with data>", "<Finding 2 with data>", "<Finding 3 with data>"],
    "metrics": [
      { "label": "REVENUE", "value": "$4.2M", "trend": "up" }
    ],
    "items": [
      {
        "title": "<Recommendation / Scorecard Item Title>",
        "description": "<Actionable detail with target data>",
        "status": "good|warning|critical",
        "score": 90,
        "maxScore": 100,
        "category": "<Category Name>"
      }
    ],
    "processSteps": [
      { "stepNumber": 1, "title": "<Step 1>", "description": "<Action 1>", "icon": "check" }
    ],
    "twoColumns": {
      "left": { "title": "<Column 1 Title>", "bullets": ["<Point A>", "<Point B>"] },
      "right": { "title": "<Column 2 Title>", "bullets": ["<Point X>", "<Point Y>"] }
    },
    "swotData": {
      "strengths": ["<Strength 1>"],
      "weaknesses": ["<Weakness 1>"],
      "opportunities": ["<Opportunity 1>"],
      "threats": ["<Threat 1>"]
    },
    "timeline": [
      { "date": "Q1 2025", "event": "<Milestone>", "detail": "<Details>" }
    ],
    "chartData": {
      "type": "bar|line|pie|donut",
      "title": "<Chart Title>",
      "labels": ["Cat 1", "Cat 2", "Cat 3"],
      "values": [12, 24, 36]
    },
    "quote": {
      "text": "<Strategic quote>",
      "attribution": "<Author/Source>"
    },
    "speakerNotes": "<Concise speaker talking points>"
  }
]`;
};
