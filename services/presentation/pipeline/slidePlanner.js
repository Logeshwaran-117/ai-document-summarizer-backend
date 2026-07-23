/**
 * slidePlanner.js
 * Stage 4: Slide Intent & Content Generation with Micro-Batch Context.
 */

const GeminiClient = require("../../ai/GeminiClient");
const ResponseValidator = require("../../ai/ResponseValidator");
const ChartCleaner = require("../utils/chartCleaner");
const buildPlannerPrompt = require("../prompts/planner.v1");

async function planSlideContent(context, storyStrategy, outline) {
  console.log(`🎨 [SlidePlanner] Planning detailed slide content across ${outline.length} slides...`);
  
  // For data-heavy slide types (kpi, chart, scorecard, recommendations), use micro-batches of 1 to 2 slides for maximum precision
  const BATCH_SIZE = 2;
  const allSlides = [];

  for (let i = 0; i < outline.length; i += BATCH_SIZE) {
    const batchOutline = outline.slice(i, i + BATCH_SIZE);
    console.log(`  └─ Planning slides ${batchOutline.map(b => b.slideNumber).join(", ")} of ${outline.length}...`);

    const prompt = buildPlannerPrompt(context, storyStrategy, batchOutline);
    let batchSlides = [];
    try {
      const rawResponse = await GeminiClient.generateText(prompt);
      batchSlides = ResponseValidator.parseAndValidate(rawResponse, "slidePlanner");
    } catch (err) {
      console.warn(`⚠️ Batch plan warning for slide ${batchOutline[0]?.slideNumber}: ${err.message}`);
    }

    if (!Array.isArray(batchSlides) || batchSlides.length === 0) {
      batchSlides = batchOutline.map(o => ({
        slideNumber: o.slideNumber,
        slideType: o.slideType,
        headline: o.title,
        subtitle: o.contentFocus,
        bullets: ["Key finding from document analysis"],
        metrics: [],
        items: [],
      }));
    }

    allSlides.push(...batchSlides);
  }

  // Clean & sanitize charts
  allSlides.forEach(slide => {
    if (slide.chartData) {
      slide.chartData = ChartCleaner.sanitizeChart(slide.chartData);
    }
  });

  return allSlides;
}

module.exports = { planSlideContent };
