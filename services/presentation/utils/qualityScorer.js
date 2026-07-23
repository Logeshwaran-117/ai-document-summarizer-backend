/**
 * qualityScorer.js
 * 0-100 quality scoring engine evaluating visual balance, typography, charts, whitespace,
 * card balance, and per-slide quality scores.
 */

class QualityScorer {
  static evaluate(presentationModel) {
    const slides = presentationModel.slides || [];
    if (slides.length === 0) {
      return { overall: 0, visualBalance: 0, typography: 0, charts: 0, whitespace: 0, consistency: 100, slideScores: [] };
    }

    let typographyScore = 100;
    let visualBalanceScore = 95;
    let chartScore = 95;
    let whitespaceScore = 95;
    let consistencyScore = 95;

    const slideScores = [];

    slides.forEach((slide, idx) => {
      let slideIndividual = 100;

      // 1. Headline length check
      if (slide.headline && slide.headline.length > 80) {
        typographyScore -= 3;
        slideIndividual -= 8;
      }

      // 2. Bullets density check
      if (Array.isArray(slide.bullets) && slide.bullets.length > 6) {
        whitespaceScore -= 4;
        slideIndividual -= 10;
      }

      // 3. Card count check
      if (Array.isArray(slide.cards) && slide.cards.length > 6) {
        visualBalanceScore -= 4;
        slideIndividual -= 10;
      }

      // 4. Chart integrity check
      if (slide.chart) {
        if (!slide.chart.categories || slide.chart.categories.length === 0) {
          chartScore -= 8;
          slideIndividual -= 15;
        }
        if (!slide.chart.series || slide.chart.series.length === 0) {
          chartScore -= 8;
          slideIndividual -= 15;
        }
      }

      // 5. Key Insight Callout check
      if (!slide.keyInsight && slide.type !== "title" && slide.type !== "closing") {
        slideIndividual -= 5;
      }

      slideIndividual = Math.max(65, Math.min(100, slideIndividual));
      slide.slideQualityScore = slideIndividual;

      slideScores.push({
        slideNumber: idx + 1,
        headline: (slide.headline || slide.title || `Slide ${idx + 1}`).slice(0, 45),
        score: slideIndividual,
      });
    });

    typographyScore = Math.max(70, Math.min(100, typographyScore));
    visualBalanceScore = Math.max(70, Math.min(100, visualBalanceScore));
    chartScore = Math.max(70, Math.min(100, chartScore));
    whitespaceScore = Math.max(70, Math.min(100, whitespaceScore));
    consistencyScore = Math.max(70, Math.min(100, consistencyScore));

    const overall = Math.round(
      typographyScore * 0.25 +
      visualBalanceScore * 0.25 +
      chartScore * 0.20 +
      whitespaceScore * 0.15 +
      consistencyScore * 0.15
    );

    const result = {
      overall,
      visualBalance: visualBalanceScore,
      typography: typographyScore,
      charts: chartScore,
      whitespace: whitespaceScore,
      consistency: consistencyScore,
      slideScores,
    };

    presentationModel.qualityScore = result;
    return result;
  }
}

module.exports = QualityScorer;
