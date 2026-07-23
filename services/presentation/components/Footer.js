/**
 * Footer.js
 * Component for rendering presentation slide footers, document title callouts,
 * date stamps, and slide counter badges.
 */

class FooterComponent {
  static render(slide, presentationModel, slideNum, totalSlides, theme) {
    const footerY = 7.0;

    // Document Title Callout
    const docTitle = presentationModel.metadata?.title || "Executive Presentation";
    slide.addText(String(docTitle).slice(0, 50), {
      x: 0.8,
      y: footerY,
      w: 8.0,
      h: 0.3,
      fontSize: 9,
      color: theme.textMuted || "7A90B8",
      fontFace: theme.fonts?.body || "Calibri",
      valign: "middle",
    });

    // Page Number Badge Container
    const badgeX = 11.5;
    const badgeW = 1.0;
    const badgeH = 0.3;

    slide.addShape(slide.shapes.ROUNDED_RECTANGLE, {
      x: badgeX,
      y: footerY,
      w: badgeW,
      h: badgeH,
      rectRadius: 0.05,
      fill: { color: theme.bgDark || "0F1B38" },
      line: { color: theme.bgDark || "0F1B38" },
    });

    // Slide Counter Badge Text (e.g. 01 / 12)
    const formattedNum = String(slideNum).padStart(2, "0");
    const formattedTotal = String(totalSlides).padStart(2, "0");

    slide.addText(`${formattedNum} / ${formattedTotal}`, {
      x: badgeX,
      y: footerY,
      w: badgeW,
      h: badgeH,
      fontSize: 8.5,
      bold: true,
      color: theme.textLight || "FFFFFF",
      align: "center",
      valign: "middle",
      fontFace: theme.fonts?.body || "Calibri",
    });
  }
}

module.exports = FooterComponent;
