/**
 * ConstraintEngine.js
 * Safe area enforcement, bounding box overflow detection, collision avoidance, and dynamic box expansion.
 * Ensures zero content spills outside 1280x720 slide canvas or into adjacent elements.
 */

const SAFE_AREA = {
  minX: 60,
  minY: 60,
  maxX: 1220,
  maxY: 660,
  width: 1160,
  height: 600,
};

class ConstraintEngine {
  static get SAFE_AREA() {
    return SAFE_AREA;
  }

  /**
   * Clamps box coordinates so they strictly stay inside slide safe area margins.
   */
  static enforceSafeArea(box) {
    const x = Math.max(SAFE_AREA.minX, Math.min(box.x, SAFE_AREA.maxX - box.width));
    const y = Math.max(SAFE_AREA.minY, Math.min(box.y, SAFE_AREA.maxY - box.height));
    const width = Math.min(box.width, SAFE_AREA.maxX - x);
    const height = Math.min(box.height, SAFE_AREA.maxY - y);

    return { ...box, x, y, width, height };
  }

  /**
   * Checks if a box spills outside container bounds or safe area limits.
   */
  static detectOverflow(box, container = SAFE_AREA) {
    const overflowRight = (box.x + box.width) - (container.x !== undefined ? container.x + container.width : container.maxX);
    const overflowBottom = (box.y + box.height) - (container.y !== undefined ? container.y + container.height : container.maxY);

    return {
      hasOverflow: overflowRight > 0 || overflowBottom > 0,
      overflowRight: Math.max(0, overflowRight),
      overflowBottom: Math.max(0, overflowBottom),
    };
  }

  /**
   * Detects collision/overlap between two bounding boxes.
   */
  static detectCollision(boxA, boxB, minGap = 20) {
    const aRight = boxA.x + boxA.width;
    const aBottom = boxA.y + boxA.height;
    const bRight = boxB.x + boxB.width;
    const bBottom = boxB.y + boxB.height;

    const overlapX = Math.min(aRight + minGap, bRight + minGap) - Math.max(boxA.x, boxB.x);
    const overlapY = Math.min(aBottom + minGap, bBottom + minGap) - Math.max(boxA.y, boxB.y);

    const isColliding = overlapX > 0 && overlapY > 0;
    return {
      isColliding,
      overlapX: isColliding ? overlapX : 0,
      overlapY: isColliding ? overlapY : 0,
    };
  }

  /**
   * Adjusts vertical spacing between stacked elements to resolve collisions and fit inside slide safe height.
   */
  static resolveVerticalCollisions(elements, startY = 160, maxBottom = 640, minGap = 15) {
    let currentY = startY;

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      el.y = currentY;
      currentY += el.height + minGap;
    }

    // If total height exceeds maxBottom, scale down heights or gap
    if (currentY - minGap > maxBottom) {
      const overflow = (currentY - minGap) - maxBottom;
      const flexElements = elements.filter(e => e.isFlex !== false);
      if (flexElements.length > 0) {
        const shrinkPerEl = Math.ceil(overflow / flexElements.length);
        currentY = startY;
        for (let i = 0; i < elements.length; i++) {
          const el = elements[i];
          el.y = currentY;
          if (el.isFlex !== false) {
            el.height = Math.max(40, el.height - shrinkPerEl);
          }
          currentY += el.height + minGap;
        }
      }
    }

    return elements;
  }
}

module.exports = ConstraintEngine;
