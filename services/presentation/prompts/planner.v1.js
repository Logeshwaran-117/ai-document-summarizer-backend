/**
 * planner.v1.js — Prompt template for Detailed Slide Content & Layout Planner
 */

module.exports = function buildPlannerPrompt(context, storyStrategy, outline) {
  const outlineStr = JSON.stringify(outline, null, 2);
  
  return `You are an elite McKinsey slide presentation designer. Create rich, detailed slide content for each slide in the outline below.
Extract EXACT metrics, numbers, structured bullet points, card structures, tables, and charts from the document text.
AVOID generic placeholder text. Every bullet must contain concrete facts and findings.

DOCUMENT TEXT:
"""
${context.documentSample}
"""

OUTLINE:
${outlineStr}

Return ONLY a JSON array of slide content objects matching the schema below:

JSON SCHEMA REQUIRED:
[
  {
    "slideNumber": 1,
    "slideType": "title|executiveSummary|comparison|process|scorecard|cards|timeline|chart|table|quote|closing",
    "headline": "<Action Headline summarizing key insight max 70 chars>",
    "subtitle": "<Subheading context max 90 chars>",
    "keyInsight": "<Key strategic takeaway max 120 chars>",
    "bullets": ["<Finding 1 with data>", "<Finding 2 with data>", "<Finding 3 with data>"],
    "cards": [
      {
        "title": "<Card Title>",
        "value": "$1.2M or 84%",
        "subtitle": "<Metric context>",
        "description": "<Card takeaway>",
        "icon": "trending-up|dollar-sign|check-circle|users|shield|alert-circle",
        "trend": { "direction": "up|down|flat", "value": "+14%" }
      }
    ],
    "processSteps": [
      { "stepNumber": 1, "title": "<Step 1>", "description": "<Action 1>", "icon": "check" }
    ],
    "table": {
      "headers": ["Metric", "Q1", "Q2", "Growth"],
      "rows": [["Revenue", "$1.2M", "$1.8M", "+50%"]]
    },
    "chart": {
      "chartType": "bar|pie|donut|line",
      "title": "<Chart Title>",
      "categories": ["Cat 1", "Cat 2", "Cat 3"],
      "series": [{ "name": "2025", "values": [12, 24, 36] }],
      "unit": "$"
    },
    "quote": {
      "text": "<Strategic quote>",
      "author": "<Author/Source>",
      "role": "<Role>"
    },
    "speakerNotes": "<Concise speaker talking points>"
  }
]`;
};
