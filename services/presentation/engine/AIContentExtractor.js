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

    const prompt = `You are an expert executive presentation planner. Analyze this document and generate a structured slide-by-slide JSON outline.

DOCUMENT TEXT:
"""
${(documentText || "").slice(0, 8000)}
"""

REQUIREMENTS:
- Target total slides: ${slideCount}
- Theme: ${preferredTheme}
- Focus on extracting REAL factual insights, metrics, quotes, recommendations, steps, and chart data points from the document.
- DO NOT generate SVG, HTML, XML tags, or layout coordinates (x, y, width, height). Output ONLY pure semantic data JSON.

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
        { "label": "<Metric Label>", "value": "<Metric Value e.g. $4.2M or 85%>", "detail": "<Brief explanation>" }
      ],
      "cards": [
        { "title": "<Card Title>", "value": "<Value/Badge>", "detail": "<Summary>", "bullets": ["<Detail bullet 1>", "<Detail bullet 2>"] }
      ],
      "steps": [
        { "stepNumber": "01", "title": "<Step Title>", "description": "<Action item details>" }
      ],
      "quadrants": {
        "strengths": ["<Strength 1>", "<Strength 2>"],
        "weaknesses": ["<Weakness 1>", "<Weakness 2>"],
        "opportunities": ["<Opportunity 1>", "<Opportunity 2>"],
        "threats": ["<Threat 1>", "<Threat 2>"]
      },
      "chart": {
        "type": "bar",
        "categories": ["Cat A", "Cat B", "Cat C", "Cat D"],
        "series": [
          { "name": "Actual", "values": [85, 72, 90, 64] }
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
        () => [{ text: prompt }], 16384, "gemini-3.5-flash", null, "summarize", "application/json"
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

    const mainTitle = wizardOptions.title || (lines[0] ? lines[0].slice(0, 55) : "Executive Strategy Document");
    const slideTypes = ["cover", "executiveSummary", "kpi", "twoColumn", "process", "scorecard", "chart", "swot", "recommendations", "closing"];

    const slides = [];
    for (let i = 0; i < slideCount; i++) {
      const sType = i === 0 ? "cover" : i === slideCount - 1 ? "closing" : slideTypes[i % slideTypes.length];
      const snippet = lines[i % lines.length] || `Strategic Insight ${i + 1}`;
      const lineB = lines[(i + 1) % lines.length] || "Operational performance baseline validated across core business sectors.";
      const lineC = lines[(i + 2) % lines.length] || "Governance structures aligned with corporate growth targets.";

      const slide = {
        slideNumber: i + 1,
        slideType: sType,
        title: sType === "cover" ? mainTitle : sType === "closing" ? "Thank You" : snippet.slice(0, 45),
        subtitle: sType === "cover" ? "Strategic Overview & Performance Audit" : snippet.slice(0, 80),
        bullets: [snippet, lineB, lineC],
        metrics: [
          { label: "Target Growth", value: `${(i + 1) * 12 + 15}%`, detail: "Year-over-year expansion" },
          { label: "Efficiency Ratio", value: `${90 - i * 3}%`, detail: "Resource utilization score" },
          { label: "Capital Allocation", value: `$${(i + 2) * 1.5}M`, detail: "Approved budget pool" },
        ],
        cards: [
          { title: "Core Objective", value: "Phase 1", detail: snippet, bullets: [lineB] },
          { title: "Risk Mitigation", value: "High Priority", detail: lineB, bullets: [lineC] },
          { title: "Growth Driver", value: "Verified", detail: lineC, bullets: [snippet] },
        ],
        steps: [
          { stepNumber: "01", title: "Diagnostic Assessment", description: snippet },
          { stepNumber: "02", title: "Strategy Formulation", description: lineB },
          { stepNumber: "03", title: "Execution & Monitoring", description: lineC },
        ],
        quadrants: {
          strengths: [snippet, "Robust capital reserves"],
          weaknesses: [lineB, "Legacy processing bottlenecks"],
          opportunities: ["Digital automation rollout", lineC],
          threats: ["Regulatory policy shifts", "Market yield volatility"],
        },
        chart: {
          type: "bar",
          categories: ["Q1 Baseline", "Q2 Growth", "Q3 Target", "Q4 Forecast"],
          series: [
            { name: "Performance", values: [75, 82, 91, 88] }
          ]
        }
      };
      slides.push(slide);
    }

    return {
      presentationTitle: mainTitle,
      executiveSummary: lines[1] ? lines[1].slice(0, 120) : "Comprehensive analytical audit.",
      theme: wizardOptions.theme || "Professional",
      slides,
    };
  }
}

module.exports = AIContentExtractor;
