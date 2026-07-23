/**
 * presentation/index.js — Master Pipeline Facade & Orchestration Controller
 * Runs the 7-stage Enterprise Presentation Engine:
 *   1. Document Analysis
 *   2. Story Strategy
 *   3. Outline & Story Sequence Validation
 *   4. Slide Content Planning
 *   5. AI Slide Review & Polish
 *   6. Render Dry Run Bounding Box Optimization
 *   7. Overall & Slide-Level Quality Scoring
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
const SlideReviewer = require("./pipeline/slideReviewer");
const StoryValidator = require("./pipeline/storyValidator");

// Renderers & Utilities
const DryRunSimulator = require("./renderer/dryRunSimulator");
const QualityScorer = require("./utils/qualityScorer");
const DebugViewer = require("./utils/debugViewer");
const { exportToPptx } = require("./export/pptExport");

async function generatePresentationPlan(documentText, wizardOptions = {}, onProgress = null) {
  const taskId = wizardOptions.taskId || `task_${Date.now()}`;
  console.log(`🚀 [PresentationEngine v2.0] Starting 7-stage pipeline for Task ID: ${taskId}`);

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

    // Stage 2: Story Strategy (25%)
    const storyStrategy = await StageRunner.runStage(
      "storyStrategy", stateManager, emitter, 25, "Building strategic narrative arc & key messages...",
      () => generateStory(context)
    );

    // Stage 3: Slide Outline & Story Sequence Validation (45%)
    const rawOutline = await StageRunner.runStage(
      "slideOutline", stateManager, emitter, 45, `Fitting outline to target ${context.slideCount} slides...`,
      () => generateOutline(context, storyStrategy)
    );

    StoryValidator.validateNarrativeSequence(rawOutline, storyStrategy);

    // Stage 4: Slide Content Planning (65%)
    const rawSlidesData = await StageRunner.runStage(
      "slidePlanning", stateManager, emitter, 65, "Planning rich slide content, cards & charts...",
      () => planSlideContent(context, storyStrategy, rawOutline)
    );

    // Stage 5: AI Slide Review & Lead-in Quality Polish (75%)
    const polishedSlidesData = await StageRunner.runStage(
      "slideReview", stateManager, emitter, 75, "Running AI slide review & lead-in formatting polish...",
      () => SlideReviewer.reviewAndPolishSlides(rawSlidesData, context)
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
        name: wizardOptions.theme || docAnalysis.type || "executive",
      },
      slides: polishedSlidesData,
    });

    // Stage 6: Render Dry Run Bounding Box Optimization (85%)
    emitter.emit("dryRun", 85, "Executing pre-render dry-run simulation & font scaling...");
    DryRunSimulator.simulateAndAdjust(presentationModel);

    // Stage 7: Quality Scoring (Overall + Per-Slide) & Debug Trace (95%)
    emitter.emit("qualityScoring", 95, "Evaluating presentation visual quality & per-slide density scores...");
    QualityScorer.evaluate(presentationModel);
    DebugViewer.generateDebugReport(taskId, presentationModel);

    stateManager.setStatus("completed");
    emitter.emit("completed", 100, "Enterprise Presentation Engine planning complete!");

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
