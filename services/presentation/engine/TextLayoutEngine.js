/**
 * TextLayoutEngine.js
 * Accurate text measurement, line wrapping, dynamic font scaling, and line height calculations.
 * Eliminates AI text coordinate guessing and prevents text truncation/overflow.
 */

let canvasCtx = null;
try {
  const { createCanvas } = require("canvas");
  const canvas = createCanvas(1280, 720);
  canvasCtx = canvas.getContext("2d");
} catch (_) {
  // node-canvas unavailable, fallback to char metric heuristics
}

class TextLayoutEngine {
  /**
   * Estimates or measures exact pixel width of text given font parameters.
   */
  static measureTextWidth(text, fontSize, fontFace = "Calibri", fontWeight = "normal") {
    if (!text) return 0;
    const str = String(text);

    if (canvasCtx) {
      try {
        const weightStr = fontWeight === "bold" ? "bold " : "";
        canvasCtx.font = `${weightStr}${fontSize}px "${fontFace}", sans-serif`;
        return Math.ceil(canvasCtx.measureText(str).width);
      } catch (_) {}
    }

    // Heuristic fallbacks calibrated for Cambria, Calibri, Arial
    let charWidthRatio = 0.51; // default sans-serif
    if (/cambria|georgia|times/i.test(fontFace)) {
      charWidthRatio = 0.56;
    } else if (/arial|helvetica|inter|segoe/i.test(fontFace)) {
      charWidthRatio = 0.52;
    }

    let width = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if (/[A-Z0-9@#%&WWMm]/.test(char)) {
        width += fontSize * charWidthRatio * 1.25;
      } else if (/[iIl1'!\.,;:]/.test(char)) {
        width += fontSize * charWidthRatio * 0.45;
      } else {
        width += fontSize * charWidthRatio;
      }
    }

    if (fontWeight === "bold") {
      width *= 1.08;
    }

    return Math.ceil(width);
  }

  /**
   * Word-wraps text into discrete lines based on maximum pixel width bounds.
   */
  static wrapText(text, maxWidth, fontSize, fontFace = "Calibri", fontWeight = "normal", maxLines = 10) {
    if (!text) return { lines: [], width: 0, height: 0, isTruncated: false };

    const rawText = String(text).trim();
    const paragraphs = rawText.split(/\r?\n/);
    const lines = [];

    for (const para of paragraphs) {
      if (!para.trim()) continue;
      const words = para.trim().split(/\s+/);
      let currentLine = "";

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = this.measureTextWidth(testLine, fontSize, fontFace, fontWeight);

        if (testWidth <= maxWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) {
            lines.push(currentLine);
          }
          // If a single word is wider than maxWidth, split it
          if (this.measureTextWidth(word, fontSize, fontFace, fontWeight) > maxWidth) {
            let subWord = "";
            for (const ch of word) {
              if (this.measureTextWidth(subWord + ch, fontSize, fontFace, fontWeight) <= maxWidth) {
                subWord += ch;
              } else {
                lines.push(subWord);
                subWord = ch;
              }
            }
            currentLine = subWord;
          } else {
            currentLine = word;
          }
        }
      }
      if (currentLine) {
        lines.push(currentLine);
      }
    }

    let isTruncated = false;
    let finalLines = lines;

    if (finalLines.length > maxLines) {
      finalLines = finalLines.slice(0, maxLines);
      if (finalLines.length > 0) {
        let lastIdx = finalLines.length - 1;
        finalLines[lastIdx] = finalLines[lastIdx].replace(/[\s\.,;!]+$/, "") + "...";
      }
      isTruncated = true;
    }

    const maxMeasuredWidth = finalLines.reduce((max, line) => {
      return Math.max(max, this.measureTextWidth(line, fontSize, fontFace, fontWeight));
    }, 0);

    const lineHeight = this.getLineHeight(fontSize);
    const totalHeight = finalLines.length * lineHeight;

    return {
      lines: finalLines,
      width: maxMeasuredWidth,
      height: totalHeight,
      lineHeight,
      isTruncated,
    };
  }

  /**
   * Dynamically scales down font size iteratively until text fits inside container bounds.
   */
  static fitText(text, containerWidth, containerHeight, startFontSize = 18, minFontSize = 11, fontFace = "Calibri", fontWeight = "normal", maxLines = 8) {
    let currentFontSize = startFontSize;
    let wrapped = this.wrapText(text, containerWidth, currentFontSize, fontFace, fontWeight, maxLines);

    while (wrapped.height > containerHeight && currentFontSize > minFontSize) {
      currentFontSize -= 1;
      wrapped = this.wrapText(text, containerWidth, currentFontSize, fontFace, fontWeight, maxLines);
    }

    return {
      fontSize: currentFontSize,
      lines: wrapped.lines,
      width: wrapped.width,
      height: wrapped.height,
      lineHeight: wrapped.lineHeight,
      isTruncated: wrapped.isTruncated,
    };
  }

  /**
   * Returns line height in pixels for a given font size.
   */
  static getLineHeight(fontSize) {
    return Math.round(fontSize * 1.25);
  }
}

module.exports = TextLayoutEngine;
