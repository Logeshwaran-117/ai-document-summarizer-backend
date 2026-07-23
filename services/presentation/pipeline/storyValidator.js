/**
 * storyValidator.js
 * Stage 3B: Presentation Story Flow & Sequence Continuity Validator.
 * Checks story arc landmarks (Cover -> Executive Summary -> Analysis -> Recommendations -> Closing).
 */

class StoryValidator {
  static validateNarrativeSequence(outline, storyStrategy) {
    console.log("📖 [StoryValidator] Validating narrative sequence & transition continuity...");

    if (!Array.isArray(outline) || outline.length === 0) {
      return { isValid: false, warnings: ["Empty outline provided."] };
    }

    const warnings = [];

    // Landmark 1: Cover Slide
    const firstType = outline[0].type || outline[0].slideType;
    if (firstType !== "title" && firstType !== "cover") {
      warnings.push("Slide 1 should be a Title/Cover slide.");
    }

    // Landmark 2: Closing Slide
    const lastType = outline[outline.length - 1].type || outline[outline.length - 1].slideType;
    if (lastType !== "closing") {
      warnings.push("Final slide should be a Closing/Takeaways slide.");
    }

    // Landmark 3: Executive Summary / Overview early in deck
    const hasExecutive = outline.slice(0, 3).some(s => {
      const t = (s.type || s.slideType || "").toLowerCase();
      const title = (s.title || s.headline || "").toLowerCase();
      return t === "executivesummary" || title.includes("summary") || title.includes("overview");
    });

    if (!hasExecutive) {
      warnings.push("Presentation lacks an early Executive Summary or Overview slide in slides 1-3.");
    }

    // Check transition density
    let consecutiveBulletsCount = 0;
    outline.forEach((s, idx) => {
      const type = (s.type || s.slideType || "bullets").toLowerCase();
      if (type === "bullets") {
        consecutiveBulletsCount++;
        if (consecutiveBulletsCount >= 3) {
          warnings.push(`Slides ${idx - 1} to ${idx + 1} are repetitive bullet slides — consider adding visual cards or charts.`);
        }
      } else {
        consecutiveBulletsCount = 0;
      }
    });

    if (warnings.length > 0) {
      console.warn("⚠️ [StoryValidator] Story Sequence Warnings:", warnings);
    } else {
      console.log("✅ [StoryValidator] Narrative sequence continuity validated OK.");
    }

    return {
      isValid: warnings.length === 0,
      warnings,
    };
  }
}

module.exports = StoryValidator;
