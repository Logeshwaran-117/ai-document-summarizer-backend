/**
 * overflowOptimizer.js
 * Dry-run bounding box overflow check & font scaling optimizer.
 */

class OverflowOptimizer {
  static optimizeText(text, maxChars = 140, baseFontSize = 14) {
    if (!text || typeof text !== "string") return { text: "", fontSize: baseFontSize };

    if (text.length <= maxChars) {
      return { text, fontSize: baseFontSize };
    }

    // Scale font down slightly if slightly over, truncate if severely over
    const ratio = maxChars / text.length;
    let scaledFont = Math.max(10, Math.floor(baseFontSize * Math.sqrt(ratio)));

    let finalText = text;
    if (text.length > maxChars * 1.4) {
      finalText = text.slice(0, Math.floor(maxChars * 1.3)) + "...";
    }

    return { text: finalText, fontSize: scaledFont };
  }
}

module.exports = OverflowOptimizer;
