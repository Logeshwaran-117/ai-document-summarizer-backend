/**
 * ProcessArrow.js
 * Component for rendering sequential workflow process steps, numbered step cards,
 * icons, and directional flow arrows.
 */

class ProcessArrowComponent {
  static render(slide, rawSteps, theme, startY, availH = 3.8) {
    const steps = Array.isArray(rawSteps) ? rawSteps.slice(0, 5) : [];
    if (steps.length === 0) return;

    const count = steps.length;
    const gapX = 0.25;
    const totalW = 11.7;
    const stepW = (totalW - gapX * (count - 1)) / count;
    const cardH = Math.min(availH, 3.2);

    const palette = [theme.teal, theme.accent, "0077B6", "E67E22", "8E44AD"];

    steps.forEach((step, idx) => {
      const x = 0.8 + idx * (stepW + gapX);
      const accentColor = palette[idx % palette.length];

      // Card Container
      slide.addShape("roundRect", {
        x,
        y: startY,
        w: stepW,
        h: cardH,
        rectRadius: 0.06,
        fill: { color: theme.cardBg },
        line: { color: theme.border, width: 1 },
      });

      // Top Header Strip
      slide.addShape("rect", {
        x,
        y: startY,
        w: stepW,
        h: 0.45,
        fill: { color: accentColor },
        line: { color: accentColor },
      });

      // Step Number Callout
      const stepNumText = `STEP 0${step.stepNumber || idx + 1}`;
      slide.addText(stepNumText, {
        x: x + 0.15,
        y: startY + 0.08,
        w: stepW - 0.3,
        h: 0.3,
        fontSize: 9.5,
        bold: true,
        color: theme.textLight,
        fontFace: theme.fonts.body,
        charSpacing: 1,
      });

      // Step Title
      const stepTitle = String(step.title || `Phase ${idx + 1}`).slice(0, 36);
      slide.addText(stepTitle, {
        x: x + 0.2,
        y: startY + 0.6,
        w: stepW - 0.4,
        h: 0.55,
        fontSize: 12,
        bold: true,
        color: theme.textDark,
        fontFace: theme.fonts.title,
        valign: "top",
      });

      // Step Description
      const stepDesc = String(step.description || "").slice(0, 140);
      if (stepDesc) {
        slide.addText(stepDesc, {
          x: x + 0.2,
          y: startY + 1.2,
          w: stepW - 0.4,
          h: cardH - 1.3,
          fontSize: 9.5,
          color: theme.textMuted,
          fontFace: theme.fonts.body,
          valign: "top",
          lineSpacing: 16,
        });
      }

      // Connecting Flow Arrow badge (between steps)
      if (idx < count - 1) {
        const arrowX = x + stepW + gapX * 0.2;
        slide.addText("→", {
          x: arrowX,
          y: startY + cardH * 0.4,
          w: gapX * 0.6,
          h: 0.4,
          fontSize: 16,
          bold: true,
          color: theme.accent,
          align: "center",
          valign: "middle",
          fontFace: theme.fonts.body,
        });
      }
    });
  }
}

module.exports = ProcessArrowComponent;
