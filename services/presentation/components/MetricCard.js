/**
 * MetricCard.js
 * Component for rendering KPI metric cards, metric value callouts,
 * trend indicators, and card containers.
 */

class MetricCardComponent {
  static renderCard(slide, card, theme, bounds) {
    const { x, y, w, h, accentColor } = bounds;

    const cardFill = theme.cardBg || "FFFFFF";
    const cardBorder = theme.border || "DDE4F5";
    const cardAccent = accentColor || theme.teal || "008080";

    // Card Container
    slide.addShape("roundRect", {
      x,
      y,
      w,
      h,
      rectRadius: 0.06,
      fill: { color: cardFill },
      line: { color: cardBorder, width: 1 },
    });

    // Accent Top Border Strip
    slide.addShape("rect", {
      x,
      y,
      w,
      h: 0.05,
      fill: { color: cardAccent },
      line: { color: cardAccent },
    });

    // Metric Value
    const rawVal = String(card.value || "-").slice(0, 24);
    const valFontSize = rawVal.length > 16 ? 16 : rawVal.length > 10 ? 20 : 26;

    slide.addText(rawVal, {
      x: x + 0.2,
      y: y + 0.15,
      w: w - 0.4,
      h: 0.55,
      fontSize: valFontSize,
      bold: true,
      color: theme.textDark,
      fontFace: theme.fonts.title,
      valign: "middle",
    });

    // Metric Title / Label
    const titleText = String(card.title || card.label || "Metric").slice(0, 32);
    slide.addText(titleText.toUpperCase(), {
      x: x + 0.2,
      y: y + 0.72,
      w: w - 0.4,
      h: 0.32,
      fontSize: 9.5,
      bold: true,
      color: cardAccent,
      fontFace: theme.fonts.body,
      charSpacing: 0.5,
      valign: "top",
    });

    // Subtitle / Description
    const descText = card.description || card.subtitle || card.comment || "";
    if (descText && h >= 1.4) {
      slide.addText(String(descText).slice(0, 55), {
        x: x + 0.2,
        y: y + 1.05,
        w: w - 0.4,
        h: h - 1.1,
        fontSize: 8.5,
        color: theme.textMuted,
        fontFace: theme.fonts.body,
        valign: "top",
      });
    }

    // Trend Indicator Arrow
    if (card.trend) {
      const trendDir = typeof card.trend === "string" ? card.trend : card.trend.direction;
      const arrow = trendDir === "up" ? "↑" : trendDir === "down" ? "↓" : "→";
      const arrowColor = trendDir === "up" ? "27AE60" : trendDir === "down" ? "E74C3C" : "F39C12";

      slide.addText(arrow, {
        x: x + w - 0.45,
        y: y + 0.15,
        w: 0.35,
        h: 0.35,
        fontSize: 16,
        bold: true,
        color: arrowColor,
        align: "right",
        fontFace: theme.fonts.body,
      });
    }
  }

  static renderGrid(slide, cards, theme, startY, availH = 3.8) {
    if (!Array.isArray(cards) || cards.length === 0) return;

    const items = cards.slice(0, 6);
    const count = items.length;
    const cols = count <= 2 ? 2 : count <= 4 ? 2 : 3;
    const rows = Math.ceil(count / cols);

    const gapX = 0.3;
    const gapY = 0.25;
    const totalW = 11.7;
    const cardW = (totalW - gapX * (cols - 1)) / cols;
    const cardH = Math.min(Math.max((availH - gapY * (rows - 1)) / rows, 1.1), 1.7);

    const palette = [theme.teal, theme.accent, "0077B6", "E67E22", "8E44AD", "2ECC71"];

    items.forEach((card, idx) => {
      const c = idx % cols;
      const r = Math.floor(idx / cols);
      const x = 0.8 + c * (cardW + gapX);
      const y = startY + r * (cardH + gapY);
      const accentColor = palette[idx % palette.length];

      this.renderCard(slide, card, theme, { x, y, w: cardW, h: cardH, accentColor });
    });
  }
}

module.exports = MetricCardComponent;
