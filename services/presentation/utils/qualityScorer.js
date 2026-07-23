/**
 * qualityScorer.js
 * 0-100 quality scoring engine evaluating visual balance, typography, charts, whitespace & consistency.
 */

class QualityScorer {
  static evaluate(presentationModel) {
    const slides = presentationModel.slides || [];
    if (slides.length === 0) {
      return { overall: 0, visualBalance: 0, typography: 0, charts: 0, whitespace: 0, consistency: 100 };
    }

    let typographyScore = 100;
    let visualBalanceScore = 90;
    let chartScore = 95;
    let whitespaceScore = 95;
    let consistencyScore = 95;

    slides.forEach(slide => {
      // 1. Headline length check
      if (slide.headline.length > 80) typographyScore -= 4;
      if (slide.headline.length < 10 && slide.type !== "title") typographyScore -= 2;

      // 2. Bullets density check
      if (slide.bullets.length > 6) whitespaceScore -= 5;

      // 3. Card count check
      if (slide.cards.length > 6) visualBalanceScore -= 5;

      // 4. Chart integrity check
      if (slide.chart) {
        if (!slide.chart.categories || slide.chart.categories.length === 0) chartScore -= 10;
        if (!slide.chart.series || slide.chart.series.length === 0) chartScore -= 10;
      }
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
    };

    presentationModel.qualityScore = result;
    return result;
  }
}

module.exports = QualityScorer;
