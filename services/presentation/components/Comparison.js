/**
 * Comparison.js
 * Component for rendering side-by-side two-column comparison layouts
 * with custom header cards, bullet list items, and central transition badges.
 */

class ComparisonComponent {
  static render(slide, rawComparison, theme, startY, availH = 3.8) {
    if (!rawComparison) return;

    const leftData = rawComparison.left || rawComparison.col1 || { title: "Option A", bullets: [] };
    const rightData = rawComparison.right || rawComparison.col2 || { title: "Option B", bullets: [] };

    const colW = 5.5;
    const gap = 0.7;
    const cardH = Math.min(availH, 3.5);

    const columns = [
      { data: leftData, x: 0.8, accentColor: theme.teal },
      { data: rightData, x: 0.8 + colW + gap, accentColor: theme.accent },
    ];

    columns.forEach(col => {
      const { data, x, accentColor } = col;

      // Card Container
      slide.addShape("roundRect", {
        x,
        y: startY,
        w: colW,
        h: cardH,
        rectRadius: 0.06,
        fill: { color: theme.cardBg },
        line: { color: theme.border, width: 1 },
      });

      // Header Banner
      slide.addShape("roundRect", {
        x,
        y: startY,
        w: colW,
        h: 0.5,
        rectRadius: 0.06,
        fill: { color: accentColor },
        line: { color: accentColor },
      });

      // Column Title
      slide.addText(String(data.title || "Category").toUpperCase(), {
        x: x + 0.2,
        y: startY + 0.1,
        w: colW - 0.4,
        h: 0.32,
        fontSize: 11,
        bold: true,
        color: theme.textLight,
        fontFace: theme.fonts.body,
        charSpacing: 0.5,
      });

      // Column Bullets
      const rawBullets = Array.isArray(data.bullets) ? data.bullets : [];
      const cleanBullets = rawBullets.slice(0, 5).map(b => String(b).slice(0, 85));

      if (cleanBullets.length > 0) {
        const textItems = cleanBullets.map(b => ({
          text: b,
          options: {
            bullet: { code: "25AA", color: accentColor },
            fontSize: 10.5,
            color: theme.textDark,
            spaceAfter: 8,
          },
        }));

        slide.addText(textItems, {
          x: x + 0.25,
          y: startY + 0.7,
          w: colW - 0.5,
          h: cardH - 0.8,
          fontFace: theme.fonts.body,
          valign: "top",
        });
      }
    });

    // Central Transition Badge / "VS" Oval Icon
    const midX = 0.8 + colW + gap * 0.5 - 0.25;
    const midY = startY + cardH * 0.5 - 0.25;

    slide.addShape("oval", {
      x: midX,
      y: midY,
      w: 0.5,
      h: 0.5,
      fill: { color: theme.bgDark },
      line: { color: theme.accent, width: 1.5 },
    });

    slide.addText("VS", {
      x: midX,
      y: midY,
      w: 0.5,
      h: 0.5,
      fontSize: 11,
      bold: true,
      color: theme.accent,
      align: "center",
      valign: "middle",
      fontFace: theme.fonts.body,
    });
  }
}

module.exports = ComparisonComponent;
