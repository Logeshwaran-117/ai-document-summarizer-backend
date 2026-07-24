/**
 * outline.v1.js — Prompt template for Slide Outline Generator
 * Now enforces chart count and chart type constraints from wizardOptions.
 */

module.exports = function buildOutlinePrompt(context, storyStrategy) {
  // ── Chart constraint rules ─────────────────────────────────────────────────
  const rawMaxCharts = context.maxCharts;
  const chartType = context.chartType || "Automatically Detect";

  // Parse maxCharts: "Auto" → let AI decide (up to 4); numeric string → strict limit
  let maxChartsNum = 4; // default
  let chartCountInstruction = "";

  if (rawMaxCharts && rawMaxCharts !== "Auto") {
    const parsed = parseInt(String(rawMaxCharts).replace(/[^0-9]/g, ""), 10);
    if (!isNaN(parsed) && parsed >= 0) {
      maxChartsNum = parsed;
    }
  }

  // Parse per-type chart counts from context.chartCounts (set by wizard)
  const chartCounts = context.chartCounts || {};
  const hasPerTypeCounts = Object.keys(chartCounts).length > 0;

  if (hasPerTypeCounts) {
    const countLines = Object.entries(chartCounts)
      .filter(([, n]) => n > 0)
      .map(([type, n]) => `  - EXACTLY ${n} chart slide(s) of type "${type}"`)
      .join("\n");
    chartCountInstruction = `
CHART CONSTRAINTS (STRICT — DO NOT EXCEED):
You MUST include chart slides in EXACTLY these counts:
${countLines}
Total chart slides: ${Object.values(chartCounts).reduce((a, b) => a + b, 0)}
DO NOT add any additional chart slides beyond what is listed above.`;
  } else if (chartType && chartType !== "Automatically Detect") {
    // Single chart type selected
    chartCountInstruction = `
CHART CONSTRAINTS (STRICT):
- Use ONLY chart slides of type "${chartType}" (map to "bar", "pie", "line", "donut", etc.)
- Include AT MOST ${maxChartsNum} chart slides total.`;
  } else {
    chartCountInstruction = `
CHART CONSTRAINTS:
- Include AT MOST ${maxChartsNum} chart slides total across the entire presentation.
- Mix chart types (bar, line, donut/pie) based on data type detected.`;
  }

  return `You are a presentation structure designer. Generate a slide-by-slide outline of EXACTLY ${context.slideCount} slides based on this story strategy.

TITLE: ${storyStrategy.presentationTitle}
SUMMARY: ${storyStrategy.executiveSummary}
NARRATIVE: ${storyStrategy.narrativeFlow}
DOC TYPE: ${context.documentType}

${chartCountInstruction}

SUPPORTED SLIDE TYPES:
- cover (Slide 1 title slide)
- executiveSummary (Overview & high-level takeaway)
- kpi (6-card key performance indicator dashboard)
- chart (Data visualization: bar, line, pie, donut) — USE ONLY PER CHART CONSTRAINTS ABOVE
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