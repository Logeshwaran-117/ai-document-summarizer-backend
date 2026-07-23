/**
 * Title.js
 * Component for rendering presentation slide header blocks, category badges,
 * action headlines, and decorative accent lines.
 */

const OverflowOptimizer = require("../renderer/overflowOptimizer");

class TitleComponent {
  static render(slide, slideData, theme, options = {}) {
    const { isTitleSlide = false } = options;

    if (isTitleSlide) {
      this.renderMainTitle(slide, slideData, theme);
      return;
    }

    this.renderSlideHeader(slide, slideData, theme);
  }

  static renderMainTitle(slide, slideData, theme) {
    // Background Dark / Accent theme styling
    const titleText = slideData.headline || slideData.title || "Executive Document Analysis";
    const subtitleText = slideData.subtitle || slideData.executiveSummary || "";

    // Action Title
    slide.addText(titleText, {
      x: 0.8,
      y: 1.8,
      w: 11.4,
      h: 1.6,
      fontSize: titleText.length > 50 ? 32 : 38,
      bold: true,
      color: theme.textLight,
      fontFace: theme.fonts.title,
      valign: "middle",
      lineSpacing: 42,
    });

    // Subtitle
    if (subtitleText) {
      slide.addText(subtitleText.slice(0, 160), {
        x: 0.8,
        y: 3.6,
        w: 10.5,
        h: 0.9,
        fontSize: 18,
        color: theme.accent,
        fontFace: theme.fonts.body,
        valign: "top",
        lineSpacing: 24,
      });
    }

    // Accent Line
    slide.addShape(slide.shapes.RECTANGLE, {
      x: 0.8,
      y: 4.7,
      w: 2.2,
      h: 0.06,
      fill: { color: theme.accent },
      line: { color: theme.accent },
    });
  }

  static renderSlideHeader(slide, slideData, theme) {
    // Domain / Section Tag
    const categoryTag = (slideData.category || slideData.documentTypeLabel || "EXECUTIVE SUMMARY").toUpperCase();
    slide.addText(categoryTag, {
      x: 0.8,
      y: 0.38,
      w: 6.0,
      h: 0.28,
      fontSize: 9.5,
      bold: true,
      color: theme.teal,
      fontFace: theme.fonts.body,
      charSpacing: 1.5,
    });

    // Headline Text with Bounding Box Overflow Optimization
    const rawHeadline = slideData.headline || slideData.title || "Key Insight";
    const opt = OverflowOptimizer.optimizeText(rawHeadline, 85, 22);

    slide.addText(opt.text, {
      x: 0.8,
      y: 0.68,
      w: 11.5,
      h: 0.75,
      fontSize: opt.fontSize,
      bold: true,
      color: theme.textDark,
      fontFace: theme.fonts.title,
      valign: "top",
      margin: 0,
    });

    // Key Insight Callout Banner
    if (slideData.keyInsight) {
      slide.addShape(slide.shapes.RECTANGLE, {
        x: 0.8,
        y: 1.45,
        w: 11.7,
        h: 0.42,
        fill: { color: theme.cardAlt },
        line: { color: theme.border, width: 1 },
      });
      slide.addText(`💡 ${slideData.keyInsight.slice(0, 130)}`, {
        x: 0.95,
        y: 1.48,
        w: 11.4,
        h: 0.36,
        fontSize: 11.5,
        italic: true,
        color: theme.textDark,
        fontFace: theme.fonts.body,
        valign: "middle",
      });
    }
  }
}

module.exports = TitleComponent;
