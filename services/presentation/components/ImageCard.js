/**
 * ImageCard.js
 * Component for rendering visual callouts, image cards, captions,
 * and media bounds.
 */

class ImageCardComponent {
  static render(slide, rawImageData, theme, startY, availH = 3.8) {
    if (!rawImageData) return;

    const caption = typeof rawImageData === "string" ? rawImageData : rawImageData.caption || rawImageData.title || "Visual Evidence";
    const imageW = 5.5;
    const imageH = Math.min(availH, 3.2);

    // Outer Container Frame
    slide.addShape("roundRect", {
      x: 0.8,
      y: startY,
      w: imageW,
      h: imageH,
      rectRadius: 0.05,
      fill: { color: theme.cardAlt },
      line: { color: theme.border, width: 1 },
    });

    // Image Icon Callout Placeholder
    slide.addText("🖼️", {
      x: 0.8,
      y: startY + imageH * 0.3,
      w: imageW,
      h: 0.8,
      fontSize: 36,
      align: "center",
      valign: "middle",
    });

    // Caption Bar
    slide.addShape("rect", {
      x: 0.8,
      y: startY + imageH - 0.5,
      w: imageW,
      h: 0.5,
      fill: { color: theme.bgDark },
      line: { color: theme.bgDark },
    });

    slide.addText(String(caption).slice(0, 60), {
      x: 0.95,
      y: startY + imageH - 0.48,
      w: imageW - 0.3,
      h: 0.46,
      fontSize: 9.5,
      color: theme.textLight,
      fontFace: theme.fonts.body,
      valign: "middle",
    });
  }
}

module.exports = ImageCardComponent;
