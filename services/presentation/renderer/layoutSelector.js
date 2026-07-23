/**
 * layoutSelector.js
 * Multi-factor layout scoring engine matching slide feature vectors to layout templates.
 */

const metadata = require("../layouts/metadata");

class LayoutSelector {
  static selectBestLayout(slideData) {
    const type = slideData.type || slideData.slideType || "bullets";

    if (type === "title" || slideData.slideNumber === 1) return "title";
    if (type === "executiveSummary" || slideData.slideNumber === 2) return "executiveSummary";

    // Scoring dictionary
    const scores = {};

    Object.keys(metadata).forEach(layoutKey => {
      let score = 50; // base score

      const meta = metadata[layoutKey];

      // Feature matching
      if (slideData.chart && meta.supportsCharts) score += 40;
      if (slideData.cards && slideData.cards.length > 0 && meta.maxCards > 0) score += 30;
      if (slideData.table && layoutKey === "table") score += 50;
      if (slideData.quote && layoutKey === "quote") score += 50;
      if (slideData.processSteps && slideData.processSteps.length > 0 && layoutKey === "timeline") score += 50;
      if (type === layoutKey) score += 25;

      scores[layoutKey] = score;
    });

    // Pick highest scoring layout
    let bestLayout = "comparison";
    let highestScore = -1;

    Object.entries(scores).forEach(([layoutKey, score]) => {
      if (score > highestScore) {
        highestScore = score;
        bestLayout = layoutKey;
      }
    });

    return bestLayout;
  }
}

module.exports = LayoutSelector;
