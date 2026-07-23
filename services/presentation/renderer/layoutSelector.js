/**
 * layoutSelector.js
 * Multi-factor layout vector scoring engine matching slide content features,
 * card counts, chart presence, timelines, comparisons, and tables to optimal layout templates.
 */

const metadata = require("../layouts/metadata");

class LayoutSelector {
  static selectBestLayout(slideData, context = {}) {
    const type = (slideData.type || slideData.slideType || "bullets").toLowerCase();

    if (type === "title" || type === "cover" || slideData.slideNumber === 1) return "title";
    if (type === "executivesummary" || slideData.slideNumber === 2) return "executiveSummary";
    if (type === "closing") return "closing";

    // Feature Extract Vector
    const hasCards = (slideData.cards && slideData.cards.length > 0) || (slideData.metrics && slideData.metrics.length > 0);
    const cardCount = (slideData.cards ? slideData.cards.length : 0) || (slideData.metrics ? slideData.metrics.length : 0);
    const hasChart = !!(slideData.chart || slideData.chartData);
    const hasTable = !!(slideData.table || slideData.scorecard);
    const hasTimeline = !!(slideData.timeline || (slideData.processSteps && slideData.processSteps.length > 0));
    const hasComparison = !!(slideData.twoColumns || slideData.comparison || type === "twocolumn");
    const hasQuote = !!(slideData.quote || type === "quote");

    const scores = {};

    Object.keys(metadata).forEach(layoutKey => {
      let score = 40; // Base score
      const meta = metadata[layoutKey];

      // Exact Type Match Bonus
      if (type === layoutKey.toLowerCase()) score += 50;

      // Card Feature Scoring
      if (hasCards && meta.maxCards > 0) {
        score += 35;
        if (cardCount <= meta.maxCards) score += 15;
      }

      // Chart Feature Scoring
      if (hasChart && meta.supportsCharts) score += 45;

      // Table Feature Scoring
      if (hasTable && layoutKey === "table") score += 55;

      // Timeline / Process Feature Scoring
      if (hasTimeline && (layoutKey === "timeline" || layoutKey === "process")) score += 55;

      // Comparison Feature Scoring
      if (hasComparison && (layoutKey === "comparison" || layoutKey === "twoColumn")) score += 55;

      // Quote Feature Scoring
      if (hasQuote && layoutKey === "quote") score += 60;

      // Bullet Text Density Adjustment
      if (!hasCards && !hasChart && !hasTable && layoutKey === "comparison") score += 20;

      scores[layoutKey] = score;
    });

    // Select Highest Scoring Layout
    let bestLayout = "bullets";
    let highestScore = -1;

    Object.entries(scores).forEach(([layoutKey, score]) => {
      if (score > highestScore) {
        highestScore = score;
        bestLayout = layoutKey;
      }
    });

    slideData.layoutScore = highestScore;
    slideData.layout = bestLayout;

    return bestLayout;
  }
}

module.exports = LayoutSelector;
