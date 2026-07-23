/**
 * presentation/index.js — Master Pipeline Facade & Orchestration Controller
 */

const { PresentationModel } = require("./canonical/presentationModel");
const ContextBuilder = require("../ai/ContextBuilder");
const StateManager = require("./orchestrator/StateManager");
const ProgressEmitter = require("./orchestrator/ProgressEmitter");
const StageRunner = require("./orchestrator/StageRunner");

// Pipeline Stages
const { analyzeDocument } = require("./pipeline/documentAnalyzer");
const { generateStory } = require("./pipeline/storyGenerator");
const { generateOutline } = require("./pipeline/outlineGenerator");
const { planSlideContent } = require("./pipeline/slidePlanner");

// Utilities & Exports
const QualityScorer = require("./utils/qualityScorer");
const DebugViewer = require("./utils/debugViewer");
const { exportToPptx } = require("./export/pptExport");

async function generatePresentationPlan(documentText, wizardOptions = {}, onProgress = null) {
  const taskId = wizardOptions.taskId || `task_${Date.now()}`;
  console.log(`🚀 [PresentationEngine] Starting multi-stage pipeline for Task ID: ${taskId}`);

  const stateManager = new StateManager(taskId);
  const emitter = new ProgressEmitter(onProgress);

  stateManager.setStatus("running");

  try {
    // Stage 1: Document Analysis (10%)
    const docAnalysis = await StageRunner.runStage(
      "documentAnalysis", stateManager, emitter, 10, "Analyzing document structure & domain...",
      () => analyzeDocument(ContextBuilder.buildContext(documentText, wizardOptions))
    );

    // Build shared context with document analysis
    const context = ContextBuilder.buildContext(documentText, wizardOptions, docAnalysis);

    // Stage 2: Story Strategy (30%)
    const storyStrategy = await StageRunner.runStage(
      "storyStrategy", stateManager, emitter, 30, "Building strategic narrative arc & key messages...",
      () => generateStory(context)
    );

    // Stage 3: Slide Outline (50%)
    const outline = await StageRunner.runStage(
      "slideOutline", stateManager, emitter, 50, `Fitting outline to target ${context.slideCount} slides...`,
      () => generateOutline(context, storyStrategy)
    );

    // Stage 4: Slide Content Planning (75%)
    const slidesData = await StageRunner.runStage(
      "slidePlanning", stateManager, emitter, 75, "Planning rich slide content, cards & charts...",
      () => planSlideContent(context, storyStrategy, outline)
    );

    // Assemble Canonical Presentation Model
    const presentationModel = new PresentationModel({
      metadata: {
        title: storyStrategy.presentationTitle,
        subtitle: storyStrategy.executiveSummary,
        documentType: docAnalysis.type,
      },
      context: {
        audience: context.audience,
        purpose: context.purpose,
        tone: context.tone,
        keyMessages: storyStrategy.keyMessages,
      },
      theme: {
        name: wizardOptions.theme || "executive",
      },
      slides: slidesData,
    });

    // Stage 5: Quality Scoring & Debug Trace (85%)
    emitter.emit("qualityScoring", 85, "Evaluating presentation visual quality & whitespace...");
    QualityScorer.evaluate(presentationModel);
    DebugViewer.generateDebugReport(taskId, presentationModel);

    stateManager.setStatus("completed");
    emitter.emit("completed", 100, "Presentation planning complete!");

    return presentationModel.toJSON();
  } catch (err) {
    stateManager.setStatus("failed");
    emitter.emit("failed", 0, `Pipeline failed: ${err.message}`);
    throw err;
  }
}

async function renderPresentationToPptx(presentationData, outputPath) {
  const presentationModel = new PresentationModel(presentationData);
  return exportToPptx(presentationModel, outputPath);
}

module.exports = {
  generatePresentationPlan,
  renderPresentationToPptx,
};
