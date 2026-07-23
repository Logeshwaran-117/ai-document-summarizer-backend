/**
 * StateManager.js
 * Manages pipeline stage snapshot persistence & resume functionality.
 */

const fs = require("fs");
const path = require("path");

class StateManager {
  constructor(taskId) {
    this.taskId = taskId || `task_${Date.now()}`;
    this.stateDir = path.join(__dirname, "../../../logs/states");
    this.stateFile = path.join(this.stateDir, `${this.taskId}.json`);
    this.state = {
      taskId: this.taskId,
      status: "initialized", // initialized, running, completed, failed
      currentStage: "none",
      completedStages: [],
      stageData: {},
      createdDate: new Date().toISOString(),
      updatedDate: new Date().toISOString(),
    };

    this.init();
  }

  init() {
    try {
      if (!fs.existsSync(this.stateDir)) {
        fs.mkdirSync(this.stateDir, { recursive: true });
      }
      if (fs.existsSync(this.stateFile)) {
        const raw = fs.readFileSync(this.stateFile, "utf8");
        this.state = JSON.parse(raw);
      }
    } catch (err) {
      console.warn("⚠️ [StateManager] Failed to load snapshot state:", err.message);
    }
  }

  isStageCompleted(stageName) {
    return this.state.completedStages.includes(stageName);
  }

  getStageData(stageName) {
    return this.state.stageData[stageName] || null;
  }

  saveStageData(stageName, data) {
    this.state.stageData[stageName] = data;
    if (!this.state.completedStages.includes(stageName)) {
      this.state.completedStages.push(stageName);
    }
    this.state.currentStage = stageName;
    this.state.updatedDate = new Date().toISOString();
    this.persist();
  }

  setStatus(status) {
    this.state.status = status;
    this.state.updatedDate = new Date().toISOString();
    this.persist();
  }

  persist() {
    try {
      fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2), "utf8");
    } catch (err) {
      console.warn("⚠️ [StateManager] Failed to persist state file:", err.message);
    }
  }
}

module.exports = StateManager;
