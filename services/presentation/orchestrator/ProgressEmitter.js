/**
 * ProgressEmitter.js
 * Emits real-time progress events for SSE / WebSocket frontend reporting.
 */

class ProgressEmitter {
  constructor(onProgress = null) {
    this.onProgress = onProgress;
  }

  emit(stage, percentage, message, currentSlide = 0, totalSlides = 0) {
    const payload = {
      stage,
      percentage: Math.min(Math.max(percentage, 0), 100),
      message,
      currentSlide,
      totalSlides,
      timestamp: new Date().toISOString(),
    };

    console.log(`📊 [Pipeline Progress ${payload.percentage}%] ${stage}: ${message}`);

    if (typeof this.onProgress === "function") {
      try {
        this.onProgress(payload);
      } catch (err) {
        console.warn("⚠️ Error in onProgress callback:", err.message);
      }
    }

    return payload;
  }
}

module.exports = ProgressEmitter;
