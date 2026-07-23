/**
 * dryRunSimulator.js
 * Stage 6: Dry-Run Simulation & Bounding Box Overflow Check.
 * Simulates rendering layout bounds, calculates text density %, and automatically
 * adjusts element scaling & line truncation prior to physical export.
 */

const OverflowOptimizer = require("./overflowOptimizer");

class DryRunSimulator {
  static simulateAndAdjust(presentationModel) {
    console.log("📐 [DryRunSimulator] Executing pre-render simulation & bounding box overflow optimization...");

    const slides = presentationModel.slides || [];
    slides.forEach((slide, idx) => {
      this.simulateSlide(slide, idx + 1);
    });

    console.log("✅ [DryRunSimulator] Simulation complete. Slide layouts optimized.");
    return presentationModel;
  }

  static simulateSlide(slide, slideNum) {
    // 1. Headline Bounding Check
    if (slide.headline) {
      const opt = OverflowOptimizer.optimizeText(slide.headline, 80, 22);
      slide.headline = opt.text;
      slide.headlineFontSize = opt.fontSize;
    }

    // 2. Subtitle / Key Insight Bounding Check
    if (slide.keyInsight) {
      const opt = OverflowOptimizer.optimizeText(slide.keyInsight, 130, 12);
      slide.keyInsight = opt.text;
    }

    // 3. Bullets Length & Item Count Bounding Check
    if (Array.isArray(slide.bullets) && slide.bullets.length > 0) {
      if (slide.bullets.length > 7) {
        console.warn(`⚠️ [DryRunSimulator] Slide ${slideNum} has ${slide.bullets.length} bullets — capping at 7 to prevent overflow.`);
        slide.bullets = slide.bullets.slice(0, 7);
      }
      slide.bullets = slide.bullets.map(b => OverflowOptimizer.optimizeText(b, 120, 11).text);
    }

    // 4. Cards Count Bounding Check
    if (Array.isArray(slide.cards) && slide.cards.length > 0) {
      if (slide.cards.length > 6) {
        console.warn(`⚠️ [DryRunSimulator] Slide ${slideNum} has ${slide.cards.length} cards — capping grid at 6 cards.`);
        slide.cards = slide.cards.slice(0, 6);
      }
    }

    // 5. Calculate Simulated Whitespace %
    let estimatedContentArea = 0;
    if (slide.headline) estimatedContentArea += 0.8;
    if (slide.keyInsight) estimatedContentArea += 0.5;
    if (slide.bullets) estimatedContentArea += slide.bullets.length * 0.45;
    if (slide.cards) estimatedContentArea += Math.ceil(slide.cards.length / 3) * 1.5;
    if (slide.chart) estimatedContentArea += 3.5;

    const totalSlideArea = 5.63;
    const occupiedRatio = Math.min(estimatedContentArea / totalSlideArea, 0.95);
    slide.simulatedWhitespacePct = Math.round((1 - occupiedRatio) * 100);
  }
}

module.exports = DryRunSimulator;
