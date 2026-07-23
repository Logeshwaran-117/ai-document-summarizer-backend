/**
 * slideReviewer.js
 * Stage 5: AI Slide Quality & Content Polish Reviewer.
 * Reviews planned slide content for repetitive headlines, generic bullets,
 * missing lead-ins, and data quality issues.
 */

class SlideReviewer {
  static reviewAndPolishSlides(slidesData, context) {
    console.log("🔍 [SlideReviewer] Running AI slide quality & lead-in review...");

    if (!Array.isArray(slidesData) || slidesData.length === 0) {
      return slidesData;
    }

    const seenHeadlines = new Set();

    const polishedSlides = slidesData.map((slide, idx) => {
      const copy = { ...slide };

      // 1. Headline Repetition & Generic Title Guard
      let rawTitle = copy.headline || copy.title || `Slide ${idx + 1}`;
      if (this.isGenericTitle(rawTitle) || seenHeadlines.has(rawTitle.toLowerCase())) {
        rawTitle = this.generateSpecificHeadline(rawTitle, copy, idx);
      }
      seenHeadlines.add(rawTitle.toLowerCase());
      copy.headline = rawTitle;

      // 2. Format Lead-in Tags on Bullets (**Lead-in**: Explanation)
      if (Array.isArray(copy.bullets) && copy.bullets.length > 0) {
        copy.bullets = copy.bullets.map(b => this.formatLeadInBullet(b));
      }

      // 3. Ensure Key Insight callout exists for content slides
      if (!copy.keyInsight && copy.bullets && copy.bullets.length > 0) {
        copy.keyInsight = copy.bullets[0].replace(/\*\*(.*?)\*\*:\s*/, "");
      }

      // 4. Calculate Individual Slide Quality Score
      copy.slideQualityScore = this.scoreIndividualSlide(copy);

      return copy;
    });

    return polishedSlides;
  }

  static isGenericTitle(title) {
    if (!title || typeof title !== "string") return true;
    const lower = title.toLowerCase().trim();
    const genericTerms = [
      "additional observations",
      "key findings",
      "overview",
      "summary",
      "data analysis",
      "observations",
      "supplementary data",
      "general info",
      "details",
    ];
    return genericTerms.includes(lower) || lower.length < 5;
  }

  static generateSpecificHeadline(originalTitle, slide, idx) {
    if (slide.cards && slide.cards.length > 0 && slide.cards[0].title) {
      return `${slide.cards[0].title}: Key Metric Reaches ${slide.cards[0].value}`;
    }
    if (slide.chart && slide.chart.title) {
      return `${slide.chart.title} Data Breakdown`;
    }
    if (slide.bullets && slide.bullets.length > 0) {
      const firstBulletClean = slide.bullets[0].replace(/\*\*/g, "").slice(0, 50);
      return `${firstBulletClean}...`;
    }
    return `Strategic Insight ${idx + 1}: ${originalTitle}`;
  }

  static formatLeadInBullet(bulletStr) {
    if (!bulletStr || typeof bulletStr !== "string") return "";
    let clean = bulletStr.trim();
    if (clean.includes("**") && clean.includes(":")) return clean;

    const colonIdx = clean.indexOf(":");
    if (colonIdx > 2 && colonIdx < 30) {
      const lead = clean.slice(0, colonIdx).trim();
      const rest = clean.slice(colonIdx + 1).trim();
      return `**${lead}**: ${rest}`;
    }

    const words = clean.split(" ");
    if (words.length > 3) {
      const lead = words.slice(0, 2).join(" ");
      const rest = words.slice(2).join(" ");
      return `**${lead}**: ${rest}`;
    }

    return clean;
  }

  static scoreIndividualSlide(slide) {
    let score = 100;
    if (!slide.headline || slide.headline.length > 80) score -= 10;
    if (slide.bullets && slide.bullets.length > 6) score -= 15;
    if (slide.cards && slide.cards.length > 6) score -= 15;
    if (!slide.keyInsight) score -= 5;
    return Math.max(60, score);
  }
}

module.exports = SlideReviewer;
