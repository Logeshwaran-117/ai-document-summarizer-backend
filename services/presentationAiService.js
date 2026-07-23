/**
 * presentationAiService.js — Delegating Facade to Enterprise Presentation Engine (v2.0)
 * Wraps the 7-stage Enterprise Presentation Engine and provides backward-compatible adapters.
 */

const { generatePresentationPlan: runEnginePlan, renderPresentationToPptx } = require("./presentation");

async function generatePresentationPlan(documentText, wizardOptions = {}, onProgress = null) {
  console.log("⚡ Executing Multi-Stage Enterprise Presentation Engine v2.0...");
  const modelJson = await runEnginePlan(documentText, wizardOptions, onProgress);

  // Backward-compatible adapter properties for pptRoutes destructuring ({ strategy, outline, slides })
  const strategy = {
    presentationTitle: modelJson.metadata?.title || "Presentation",
    executiveSummary: modelJson.metadata?.subtitle || "",
    keyMessages: modelJson.context?.keyMessages || [],
    documentType: modelJson.metadata?.documentType || "general",
    audience: modelJson.context?.audience || "Executive Leadership",
    mostImportantInsight: modelJson.metadata?.subtitle || "",
  };

  const outline = (modelJson.slides || []).map(s => ({
    slideNumber: s.slideNumber,
    title: s.headline,
    slideType: s.type || s.layout || "bullets",
    contentFocus: s.subtitle,
  }));

  const slides = (modelJson.slides || []).map(s => ({
    ...s,
    slideType: s.type || s.layout || "bullets",
    title: s.headline,
    subtitle: s.subtitle,
    metrics: (s.cards || []).map(c => ({ label: c.title, value: c.value, trend: c.trend?.direction })),
    steps: s.processSteps || [],
    items: s.cards || [],
  }));

  return {
    ...modelJson,
    strategy,
    outline,
    slides,
  };
}

module.exports = {
  generatePresentationPlan,
  renderPresentationToPptx,
};
