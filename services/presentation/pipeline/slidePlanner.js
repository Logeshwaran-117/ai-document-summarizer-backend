/**
 * slidePlanner.js
 * Stage 4: Slide Intent & Content Content Generation.
 */

const GeminiClient = require("../../ai/GeminiClient");
const ResponseValidator = require("../../ai/ResponseValidator");
const ChartCleaner = require("../utils/chartCleaner");
const buildPlannerPrompt = require("../prompts/planner.v1");

async function planSlideContent(context, storyStrategy, outline) {
  console.log("🎨 [SlidePlanner] Planning detailed slide content, cards & charts...");
  
  const prompt = buildPlannerPrompt(context, storyStrategy, outline);
  const rawResponse = await GeminiClient.generateText(prompt);
  let slidesData = ResponseValidator.parseAndValidate(rawResponse, "slidePlanner");

  if (!Array.isArray(slidesData) || slidesData.length === 0) {
    slidesData = outline.map(o => ({
      slideNumber: o.slideNumber,
      slideType: o.slideType,
      headline: o.title,
      subtitle: o.contentFocus,
      bullets: ["Key finding from analysis"],
      cards: [],
      chart: null
    }));
  }

  // Clean & sanitize charts
  slidesData.forEach(slide => {
    if (slide.chart) {
      slide.chart = ChartCleaner.sanitizeChart(slide.chart);
    }
  });

  return slidesData;
}

module.exports = { planSlideContent };
