/**
 * outlineGenerator.js
 * Stage 3: Slide Outline & Target Slide Fitting.
 */

const GeminiClient = require("../../ai/GeminiClient");
const ResponseValidator = require("../../ai/ResponseValidator");
const buildOutlinePrompt = require("../prompts/outline.v1");

async function generateOutline(context, storyStrategy) {
  const targetCount = Math.max(3, Math.min(50, parseInt(context.slideCount) || 10));
  console.log(`📋 [OutlineGenerator] Fitting outline to target ${targetCount} slides...`);
  
  const prompt = buildOutlinePrompt({ ...context, slideCount: targetCount }, storyStrategy);
  const rawResponse = await GeminiClient.generateText(prompt);
  let outline = ResponseValidator.parseAndValidate(rawResponse, "slideOutline");

  if (!Array.isArray(outline) || outline.length === 0) {
    outline = [];
  }

  // Ensure exact target count
  const slideTypes = ["executiveSummary", "kpi", "chart", "twoColumn", "swot", "timeline", "process", "scorecard", "recommendations"];
  
  if (outline.length < targetCount) {
    const existing = [...outline];
    const cover = existing[0] || { slideNumber: 1, slideType: "cover", title: storyStrategy.presentationTitle, contentFocus: "Cover" };
    const closing = existing.length > 1 && existing[existing.length - 1].slideType === "closing"
      ? existing[existing.length - 1]
      : { slideNumber: targetCount, slideType: "closing", title: "Conclusion & Next Steps", contentFocus: "Summary" };

    const middle = existing.filter(s => s.slideType !== "cover" && s.slideType !== "closing");
    const missing = targetCount - 2 - middle.length;

    for (let i = 0; i < missing; i++) {
      const st = slideTypes[i % slideTypes.length];
      middle.push({
        slideNumber: middle.length + 2,
        slideType: st,
        title: `Analytical Focus ${middle.length + 1}`,
        contentFocus: `Deep structural breakdown of ${st} metrics and key insights.`,
        purpose: `Provide quantitative analysis for section ${i + 1}`,
      });
    }

    outline = [cover, ...middle, closing];
  } else if (outline.length > targetCount) {
    const cover = outline[0];
    const closing = outline[outline.length - 1];
    const middle = outline.slice(1, outline.length - 1);
    const step = middle.length / (targetCount - 2);
    const sampled = [];
    for (let i = 0; i < targetCount - 2; i++) {
      sampled.push(middle[Math.floor(i * step)]);
    }
    outline = [cover, ...sampled, closing];
  }

  return outline.map((s, i) => ({ ...s, slideNumber: i + 1 }));
}

module.exports = { generateOutline };
