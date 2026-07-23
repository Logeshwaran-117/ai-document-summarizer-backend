/**
 * StageRunner.js
 * Wraps individual stage execution with timing profiling, state caching & error catching.
 */

class StageRunner {
  static async runStage(stageName, stateManager, emitter, percentage, message, fn) {
    if (stateManager.isStageCompleted(stageName)) {
      console.log(`⏩ [StageRunner] Skipping cached stage: ${stageName}`);
      emitter.emit(stageName, percentage, `${message} (Cached)`);
      return stateManager.getStageData(stageName);
    }

    const startTime = Date.now();
    emitter.emit(stageName, percentage, message);

    try {
      const result = await fn();
      const latencyMs = Date.now() - startTime;
      console.log(`✅ [StageRunner] Completed ${stageName} in ${latencyMs}ms`);
      
      stateManager.saveStageData(stageName, { result, latencyMs });
      return result;
    } catch (err) {
      console.error(`❌ [StageRunner] Stage ${stageName} failed: ${err.message}`);
      throw err;
    }
  }
}

module.exports = StageRunner;
