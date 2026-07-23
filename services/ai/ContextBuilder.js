/**
 * ContextBuilder.js
 * Assembles shared presentation context for prompt builders across pipeline stages.
 */

class ContextBuilder {
  static buildContext(documentText, wizardOptions = {}, docAnalysis = null) {
    const audience = wizardOptions.audience || docAnalysis?.estimatedAudience || "Executive Leadership";
    const purpose = wizardOptions.purpose || "Inform and present key findings";
    const slideCount = parseInt(wizardOptions.slideCount) || 10;
    const tone = wizardOptions.tone || "Professional";
    const themeName = wizardOptions.theme || "executive";

    return {
      documentText: documentText || "",
      documentSample: (documentText || "").slice(0, 8000),
      documentType: docAnalysis?.type || "general",
      documentTitle: docAnalysis?.documentTitle || "Document Analysis",
      audience,
      purpose,
      slideCount,
      tone,
      themeName,
      keyTopics: docAnalysis?.keyTopics || [],
      topMetrics: docAnalysis?.topMetrics || [],
      hasTabularData: docAnalysis?.hasTabularData || false,
    };
  }
}

module.exports = ContextBuilder;
