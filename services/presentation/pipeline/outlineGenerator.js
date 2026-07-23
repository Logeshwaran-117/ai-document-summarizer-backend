/**
 * outlineGenerator.js
 * Stage 3: Slide Outline & Target Slide Fitting.
 */

const GeminiClient = require("../../ai/GeminiClient");
const ResponseValidator = require("../../ai/ResponseValidator");
const buildOutlinePrompt = require("../prompts/outline.v1");

async function generateOutline(context, storyStrategy) {
  console.log(`📋 [OutlineGenerator] Fitting outline to target ${context.slideCount} slides...`);
  
  const prompt = buildOutlinePrompt(context, storyStrategy);
  const rawResponse = await GeminiClient.generateText(prompt);
  let outline = ResponseValidator.parseAndValidate(rawResponse, "slideOutline");

  // Fallback if outline count doesn't match target
  if (!Array.isArray(outline) || outline.length === 0) {
    outline = [
      { slideNumber: 1, slideType: "title", title: storyStrategy.presentationTitle, contentFocus: "Cover" },
      { slideNumber: 2, slideType: "executiveSummary", title: "Executive Summary", contentFocus: storyStrategy.executiveSummary },
      { slideNumber: 3, slideType: "closing", title: "Conclusion & Next Steps", contentFocus: "Summary" }
    ];
  }

  return outline.map((s, i) => ({ ...s, slideNumber: i + 1 }));
}

module.exports = { generateOutline };
