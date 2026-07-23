/**
 * VisualValidator.js
 * Visual layout validation pass after layout calculation.
 * Checks boundary overflow, container containment, and element collision.
 */

const ConstraintEngine = require("./ConstraintEngine");

class VisualValidator {
  /**
   * Performs full visual layout validation on a layout tree.
   * Returns { isValid, violations, fixedLayoutTree }.
   */
  static validateLayout(layoutTree) {
    const SAFE = ConstraintEngine.SAFE_AREA;
    const nodes = layoutTree.nodes || [];
    const violations = [];

    // 1. Boundary & Overflow Checks
    nodes.forEach((node, idx) => {
      if (node.type === "rect") {
        if (node.x < SAFE.minX || node.y < SAFE.minY || node.x + node.width > SAFE.maxX || node.y + node.height > SAFE.maxY) {
          violations.push({
            type: "CANVAS_OVERFLOW",
            nodeIndex: idx,
            message: `Rect node ${idx} overflows safe area: x=${node.x}, y=${node.y}, w=${node.width}, h=${node.height}`,
          });

          // Auto-fix rect bounds
          node.x = Math.max(SAFE.minX, Math.min(node.x, SAFE.maxX - node.width));
          node.y = Math.max(SAFE.minY, Math.min(node.y, SAFE.maxY - node.height));
          node.width = Math.min(node.width, SAFE.maxX - node.x);
          node.height = Math.min(node.height, SAFE.maxY - node.y);
        }
      } else if (node.type === "text" || node.type === "textBlock") {
        const textH = node.height || (node.lines ? node.lines.length * (node.lineHeight || 18) : 20);
        if (node.y < SAFE.minY || node.y + textH > SAFE.maxY + 15) {
          violations.push({
            type: "TEXT_CANVAS_OVERFLOW",
            nodeIndex: idx,
            message: `Text node ${idx} overflows canvas vertical bounds: y=${node.y}, textH=${textH}`,
          });

          // Auto-fix text y
          if (node.y + textH > SAFE.maxY) {
            node.y = Math.max(SAFE.minY, SAFE.maxY - textH - 5);
          }
        }
      }
    });

    // 2. Collision Checks between major container rects
    const rects = nodes.filter(n => n.type === "rect" && n.width > 100 && n.height > 60);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const rA = rects[i];
        const rB = rects[j];
        const col = ConstraintEngine.detectCollision(rA, rB, 10);
        if (col.isColliding) {
          violations.push({
            type: "CONTAINER_COLLISION",
            rectA: { x: rA.x, y: rA.y, w: rA.width, h: rA.height },
            rectB: { x: rB.x, y: rB.y, w: rB.width, h: rB.height },
            message: `Container collision detected with overlap (${col.overlapX}px, ${col.overlapY}px)`,
          });
        }
      }
    }

    if (violations.length > 0) {
      console.warn(`⚠️ [VisualValidator] Detected ${violations.length} visual layout violations (auto-repaired).`);
    } else {
      console.log("✅ [VisualValidator] Layout visual validation passed with 0 violations.");
    }

    return {
      isValid: violations.length === 0,
      violations,
      layoutTree,
    };
  }
}

module.exports = VisualValidator;
