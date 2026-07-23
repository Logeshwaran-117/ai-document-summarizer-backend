/**
 * overflowOptimizer.js
 * Bounding box overflow check, font scaling, and line length optimizer.
 */

class OverflowOptimizer {
  static optimizeText(text, maxChars = 140, baseFontSize = 14) {
    if (!text || typeof text !== "string") return { text: "", fontSize: baseFontSize };

    const len = text.length;

    if (len <= maxChars) {
      return { text, fontSize: baseFontSize };
    }

    // Tier 1: Scale font size down slightly if within 20% of max
    const ratio = maxChars / len;
    let scaledFont = Math.max(9, Math.floor(baseFontSize * Math.sqrt(ratio)));

    let finalText = text;
    // Tier 2: Truncate with ellipsis if severely over length
    if (len > maxChars * 1.25) {
      finalText = text.slice(0, Math.floor(maxChars * 1.15)).trim() + "...";
    }

    return { text: finalText, fontSize: scaledFont };
  }

  static calculateLineCount(text, maxLineChars = 60) {
    if (!text || typeof text !== "string") return 0;
    return Math.ceil(text.length / maxLineChars);
  }
}

module.exports = OverflowOptimizer;
