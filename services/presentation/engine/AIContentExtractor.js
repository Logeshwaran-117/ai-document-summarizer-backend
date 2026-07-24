/**
 * AIContentExtractor.js
 * Asks AI to extract rich semantic slide content JSON from the document.
 * Decouples AI completely from SVG generation, XML tags, and coordinate layout.
 */

const { callWithRotation } = require("../../geminiService");
const ResponseValidator = require("../../ai/ResponseValidator");

class AIContentExtractor {
  static async extractPresentationContent(documentText, wizardOptions = {}) {
    const slideCount = Math.max(3, Math.min(20, parseInt(wizardOptions.slideCount) || 10));
    const preferredTheme = wizardOptions.theme || "Professional";
    const chartTypePref = wizardOptions.chartType || "auto";

    const prompt = `You are an expert executive presentation planner. Analyze this document and generate a structured slide-by-slide JSON outline.

DOCUMENT TEXT:
"""
${(documentText || "").slice(0, 10000)}
"""

CRITICAL PRESENTATION REQUIREMENTS:
- Target total slides: ${slideCount}
- Theme: ${preferredTheme}
- User Chart Preferences: ${chartTypePref}
- VARY THE SLIDE TYPES ACROSS THE DECK! Use a mix of: "cover", "executiveSummary", "kpi", "twoColumn", "chart", "process", "swot", "recommendations", "scorecard", "closing".
- FOR CHART SLIDES: Use diverse chart types across different slides: "pie", "donut", "line", "bar", "column", "radar". Extract REAL numeric categories and percentage/count values from the document.
- FOR RECOMMENDATIONS SLIDES: Include at least 3 actionable cards with non-empty "title" and "detail".
- FOR SWOT SLIDES: Extract document-specific strengths, weaknesses, opportunities, and threats. DO NOT use generic banking/financial placeholders if the document is health, legal, education, etc.
- Focus on extracting REAL factual insights, metrics, totals, block names, and action items.
- Output ONLY pure valid JSON.

RETURN ONLY VALID JSON MATCHING THIS EXACT SCHEMA:
{
  "presentationTitle": "<Concise presentation title, max 60 chars>",
  "executiveSummary": "<1-2 sentence core message>",
  "theme": "${preferredTheme}",
  "slides": [
    {
      "slideNumber": 1,
      "slideType": "cover",
      "title": "<Main Title>",
      "subtitle": "<Subtitle / Context>",
      "author": "<Author/Organization or Confidential notice>"
    },
    {
      "slideNumber": 2,
      "slideType": "kpi|twoColumn|chart|process|swot|executiveSummary|recommendations|scorecard",
      "title": "<Slide Title>",
      "subtitle": "<Section Focus / Takeaway>",
      "bullets": ["<Insight 1>", "<Insight 2>", "<Insight 3>"],
      "metrics": [
        { "label": "<Metric Label>", "value": "<Metric Value e.g. 1,142 or 99.2%>", "detail": "<Brief explanation>" }
      ],
      "cards": [
        { "title": "<Action Title 1>", "value": "01", "detail": "<Detailed recommendation summary>", "bullets": ["<Sub-detail 1>"] },
        { "title": "<Action Title 2>", "value": "02", "detail": "<Detailed recommendation summary>", "bullets": ["<Sub-detail 2>"] },
        { "title": "<Action Title 3>", "value": "03", "detail": "<Detailed recommendation summary>", "bullets": ["<Sub-detail 3>"] }
      ],
      "steps": [
        { "stepNumber": "01", "title": "<Step Title>", "description": "<Action item details>" }
      ],
      "quadrants": {
        "strengths": ["<Document Specific Strength 1>", "<Document Specific Strength 2>"],
        "weaknesses": ["<Document Specific Weakness 1>", "<Document Specific Weakness 2>"],
        "opportunities": ["<Document Specific Opportunity 1>", "<Document Specific Opportunity 2>"],
        "threats": ["<Document Specific Threat 1>", "<Document Specific Threat 2>"]
      },
      "chart": {
        "type": "pie|donut|line|bar|column|radar",
        "categories": ["Category A", "Category B", "Category C", "Category D"],
        "series": [
          { "name": "Metric", "values": [85, 72, 90, 64] }
        ]
      }
    },
    {
      "slideNumber": ${slideCount},
      "slideType": "closing",
      "title": "Thank You",
      "subtitle": "Questions & Action Item Review",
      "author": "Next Steps & Implementation Timeline"
    }
  ]
}`;

    try {
      const raw = await callWithRotation(
        () => [{ text: prompt }], 16384, "gemini-2.5-flash", null, "summarize", "application/json"
      );
      const parsed = ResponseValidator.parseAndValidate(raw);
      if (parsed && Array.isArray(parsed.slides) && parsed.slides.length > 0) {
        console.log(`✅ [AIContentExtractor] Successfully extracted JSON content for ${parsed.slides.length} slides.`);
        return parsed;
      }
    } catch (err) {
      console.warn(`⚠️ [AIContentExtractor] AI extraction failed: ${err.message}. Falling back to structured extractor.`);
    }

    return this.generateFallbackContent(documentText, wizardOptions);
  }

  /**
   * Deterministic content extractor if AI network/parsing fails.
   */
  static generateFallbackContent(documentText, wizardOptions = {}) {
    const slideCount = Math.max(3, Math.min(20, parseInt(wizardOptions.slideCount) || 10));
    const lines = (documentText || "")
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 12);

    const mainTitle = wizardOptions.title || (lines[0] ? lines[0].slice(0, 55) : "Executive Presentation Report");
    const slideTypes = ["cover", "executiveSummary", "kpi", "twoColumn", "process", "chart", "swot", "recommendations", "chart", "closing"];
    const chartTypes = ["pie", "donut", "bar", "line", "radar", "column"];

    const slides = [];
    for (let i = 0; i < slideCount; i++) {
      const sType = i === 0 ? "cover" : i === slideCount - 1 ? "closing" : slideTypes[i % slideTypes.length];
      const snippet = lines[i % lines.length] || `Key Operational Insight ${i + 1}`;
      const lineB = lines[(i + 1) % lines.length] || "Performance baseline evaluated across active operational sectors.";
      const lineC = lines[(i + 2) % lines.length] || "Strategic measures established to enhance reporting accuracy.";

      const chartType = chartTypes[i % chartTypes.length];

      const slide = {
        slideNumber: i + 1,
        slideType: sType,
        title: sType === "cover" ? mainTitle : sType === "closing" ? "Thank You" : snippet.slice(0, 45),
        subtitle: sType === "cover" ? "Strategic Overview & Analytical Report" : snippet.slice(0, 80),
        bullets: [snippet, lineB, lineC],
        metrics: [
          { label: "Total Volume", value: `${(i + 1) * 120 + 350}`, detail: "Aggregated target cases" },
          { label: "Completion Rate", value: `${Math.min(99, 88 + i * 2)}%`, detail: "Operational efficiency" },
          { label: "Action Index", value: `${(i + 2) * 15}`, detail: "Verified implementation" },
        ],
        cards: [
          { title: "Primary Recommendation", value: "01", detail: snippet, bullets: [lineB] },
          { title: "Operational Enhancement", value: "02", detail: lineB, bullets: [lineC] },
          { title: "Quality & Governance Action", value: "03", detail: lineC, bullets: [snippet] },
        ],
        steps: [
          { stepNumber: "01", title: "Diagnostic Assessment", description: snippet },
          { stepNumber: "02", title: "Strategy Formulation", description: lineB },
          { stepNumber: "03", title: "Execution & Monitoring", description: lineC },
        ],
        quadrants: {
          strengths: [snippet.slice(0, 50), "High completion rate for verified target cases"],
          weaknesses: [lineB.slice(0, 50), "Data entry inconsistencies across reporting blocks"],
          opportunities: ["Automation of tracking pipelines", lineC.slice(0, 50)],
          threats: ["Reporting lag during peak volume periods", "Resource allocation bottlenecks"],
        },
        chart: {
          type: chartType,
          categories: ["Phase A", "Phase B", "Phase C", "Phase D"],
          series: [
            { name: "Performance", values: [75, 88, 92, 84] }
          ]
        }
      };
      slides.push(slide);
    }

    return {
      presentationTitle: mainTitle,
      executiveSummary: lines[1] ? lines[1].slice(0, 120) : "Comprehensive analytical report.",
      theme: wizardOptions.theme || "Professional",
      slides,
    };
  }
}

module.exports = AIContentExtractor;
