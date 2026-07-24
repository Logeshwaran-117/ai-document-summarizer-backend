/**
 * LayoutPlanner.js
 * Automatic Layout Planner for SVG presentation slides.
 * Computes exact coordinate geometry, dynamic container sizing, iterative reflow, and safe area constraints.
 */

const TextLayoutEngine = require("./TextLayoutEngine");
const ConstraintEngine = require("./ConstraintEngine");
const ContentNormalizer = require("./ContentNormalizer");
const VisualValidator = require("./VisualValidator");

const THEME_PALETTES = {
  Professional: { background: "#0F1B38", primary: "#F5A623", secondary: "#008080", text: "#FFFFFF", textDark: "#0F1B38", cardBg: "#1A2B50", cardBorder: "#2A3B60", muted: "#8099C0" },
  Modern:       { background: "#0D1B2A", primary: "#00B4D8", secondary: "#0077B6", text: "#FFFFFF", textDark: "#0D1B2A", cardBg: "#1B2A4A", cardBorder: "#2B3A5A", muted: "#8099C0" },
  Minimal:      { background: "#0F3D3E", primary: "#3FBFAE", secondary: "#1F7A72", text: "#FFFFFF", textDark: "#17302F", cardBg: "#1A4D4E", cardBorder: "#2A5D5E", muted: "#6E8E8C" },
  Dark:         { background: "#0F0F0F", primary: "#C0392B", secondary: "#E67E22", text: "#FFFFFF", textDark: "#0F0F0F", cardBg: "#1F1F1F", cardBorder: "#2F2F2F", muted: "#808080" },
  Corporate:    { background: "#1A1A2E", primary: "#7C3AED", secondary: "#06B6D4", text: "#FFFFFF", textDark: "#1A1A2E", cardBg: "#2A2A4E", cardBorder: "#3A3A5E", muted: "#8A80B0" },
};

class LayoutPlanner {
  /**
   * Main entry point with strict content normalization, iterative reflow, and visual validation.
   */
  static computeSlideLayout(rawSlideContent, themeName = "Professional", slideIndex = 0, totalSlides = 10) {
    // 1. Content Normalization
    const slideContent = ContentNormalizer.normalizeSlideContent(rawSlideContent);
    const palette = THEME_PALETTES[themeName] || THEME_PALETTES.Professional;

    // 2. Iterative Reflow Loop
    let fontScaleReduction = 0;
    let layoutTree = null;
    let fitsInsideCanvas = false;

    while (fontScaleReduction <= 4 && !fitsInsideCanvas) {
      layoutTree = this.buildLayoutAttempt(slideContent, palette, themeName, slideIndex, totalSlides, fontScaleReduction);

      // Safely compute max bottom node y coordinate across all content nodes (excluding footer at y=695)
      const maxBottom = layoutTree.nodes.reduce((max, node) => {
        if (node.y >= 690) return max; // Exclude footer page number node
        let nodeY = node.y;
        let nodeH = node.height || (node.lines ? node.lines.length * (node.lineHeight || 18) : 0);
        if (node.type === "line") {
          nodeY = Math.max(node.y1 || 0, node.y2 || 0);
          nodeH = 0;
        }
        if (nodeY === undefined || isNaN(nodeY)) return max;
        return Math.max(max, nodeY + (isNaN(nodeH) ? 0 : nodeH));
      }, 0);

      if (maxBottom <= ConstraintEngine.SAFE_AREA.maxY + 5) {
        fitsInsideCanvas = true;
      } else {
        console.log(`🔄 [LayoutPlanner] Iterative reflow slide ${slideIndex + 1}: content bottom (${maxBottom}px) exceeds safe limit (${ConstraintEngine.SAFE_AREA.maxY}px). Retrying with font reduction -${fontScaleReduction + 1}px...`);
        fontScaleReduction += 1;
      }
    }

    // 3. Visual Validation & Auto-repair Pass
    const validation = VisualValidator.validateLayout(layoutTree);
    return validation.layoutTree;
  }

  static buildLayoutAttempt(slideContent, palette, themeName, slideIndex, totalSlides, fontScaleReduction = 0) {
    const slideType = slideContent.slideType || "executiveSummary";
    const slideNumber = slideIndex + 1;

    const layoutTree = {
      canvas: { width: 1280, height: 720, background: palette.background },
      theme: palette,
      slideNumber,
      totalSlides,
      nodes: [],
    };

    if (slideType !== "cover" && slideType !== "closing") {
      this.buildStandardHeader(layoutTree, slideContent, palette, fontScaleReduction);
    }

    switch (slideType) {
      case "cover":
        this.layoutCoverSlide(layoutTree, slideContent, palette, fontScaleReduction);
        break;
      case "closing":
        this.layoutClosingSlide(layoutTree, slideContent, palette, fontScaleReduction);
        break;
      case "kpi":
        this.layoutKpiSlide(layoutTree, slideContent, palette, fontScaleReduction);
        break;
      case "twoColumn":
        this.layoutTwoColumnSlide(layoutTree, slideContent, palette, fontScaleReduction);
        break;
      case "chart":
        this.layoutChartSlide(layoutTree, slideContent, palette, fontScaleReduction);
        break;
      case "swot":
        this.layoutSwotSlide(layoutTree, slideContent, palette, fontScaleReduction);
        break;
      case "process":
        this.layoutProcessSlide(layoutTree, slideContent, palette, fontScaleReduction);
        break;
      case "recommendations":
        this.layoutRecommendationsSlide(layoutTree, slideContent, palette, fontScaleReduction);
        break;
      case "scorecard":
        this.layoutScorecardSlide(layoutTree, slideContent, palette, fontScaleReduction);
        break;
      case "executiveSummary":
      default:
        this.layoutExecutiveSummarySlide(layoutTree, slideContent, palette, fontScaleReduction);
        break;
    }

    // Footer Node
    layoutTree.nodes.push({
      type: "text",
      x: 1220,
      y: 695,
      text: `${slideNumber} / ${totalSlides}`,
      fontSize: 14,
      fontFace: "Calibri",
      fill: palette.muted,
      textAnchor: "end",
    });

    return layoutTree;
  }

  static buildStandardHeader(layoutTree, slideContent, palette, fontScaleReduction = 0) {
    const titleText = slideContent.title || "Executive Briefing";
    const subtitleText = slideContent.subtitle || "";

    const startTitleSize = Math.max(20, 28 - fontScaleReduction);
    const titleFit = TextLayoutEngine.fitText(titleText, 1160, 45, startTitleSize, 18, "Cambria", "bold", 1);

    layoutTree.nodes.push({
      type: "textBlock",
      x: 60,
      y: 60,
      lines: titleFit.lines,
      fontSize: titleFit.fontSize,
      fontFace: "Cambria",
      fontWeight: "bold",
      fill: palette.text,
      lineHeight: titleFit.lineHeight,
      height: titleFit.height,
    });

    if (subtitleText) {
      const startSubSize = Math.max(12, 15 - fontScaleReduction);
      const subFit = TextLayoutEngine.fitText(subtitleText, 1160, 30, startSubSize, 11, "Calibri", "bold", 1);
      layoutTree.nodes.push({
        type: "textBlock",
        x: 60,
        y: 105,
        lines: subFit.lines,
        fontSize: subFit.fontSize,
        fontFace: "Calibri",
        fontWeight: "bold",
        fill: palette.primary,
        lineHeight: subFit.lineHeight,
        height: subFit.height,
      });
    }

    layoutTree.nodes.push({
      type: "line",
      x1: 60, y1: 135, x2: 1220, y2: 135,
      stroke: palette.cardBorder, strokeWidth: 1,
    });
  }

  static layoutCoverSlide(layoutTree, slideContent, palette, fontScaleReduction = 0) {
    const title = slideContent.title || "Executive Strategic Report";
    const subtitle = slideContent.subtitle || "AI Document Summarizer Analysis";
    const author = slideContent.author || "CONFIDENTIAL & PROPRIETARY";

    const titleFit = TextLayoutEngine.fitText(title, 1000, 120, 36 - fontScaleReduction, 24, "Cambria", "bold", 2);
    layoutTree.nodes.push({
      type: "textBlock",
      x: 640, y: 250,
      lines: titleFit.lines,
      fontSize: titleFit.fontSize,
      fontFace: "Cambria", fontWeight: "bold", fill: palette.primary,
      textAnchor: "middle", lineHeight: titleFit.lineHeight, height: titleFit.height,
    });

    const subFit = TextLayoutEngine.fitText(subtitle, 900, 60, 18 - fontScaleReduction, 13, "Calibri", "normal", 2);
    layoutTree.nodes.push({
      type: "textBlock",
      x: 640, y: 360,
      lines: subFit.lines,
      fontSize: subFit.fontSize,
      fontFace: "Calibri", fill: palette.text,
      textAnchor: "middle", lineHeight: subFit.lineHeight, height: subFit.height,
    });

    layoutTree.nodes.push({
      type: "rect",
      x: 540, y: 440, width: 200, height: 4,
      fill: palette.primary, rx: 2, ry: 2,
    });

    layoutTree.nodes.push({
      type: "text",
      x: 640, y: 485,
      text: author,
      fontSize: 13, fontFace: "Calibri", fontWeight: "bold", fill: palette.muted, textAnchor: "middle",
    });
  }

  static layoutClosingSlide(layoutTree, slideContent, palette, fontScaleReduction = 0) {
    const title = slideContent.title || "Thank You";
    const subtitle = slideContent.subtitle || "Questions & Strategic Discussion";

    const titleFit = TextLayoutEngine.fitText(title, 900, 80, 36 - fontScaleReduction, 26, "Cambria", "bold", 1);
    layoutTree.nodes.push({
      type: "textBlock",
      x: 640, y: 240,
      lines: titleFit.lines,
      fontSize: titleFit.fontSize,
      fontFace: "Cambria", fontWeight: "bold", fill: palette.primary,
      textAnchor: "middle", lineHeight: titleFit.lineHeight, height: titleFit.height,
    });

    const subFit = TextLayoutEngine.fitText(subtitle, 900, 50, 18 - fontScaleReduction, 13, "Calibri", "normal", 1);
    layoutTree.nodes.push({
      type: "textBlock",
      x: 640, y: 320,
      lines: subFit.lines,
      fontSize: subFit.fontSize, fontFace: "Calibri", fill: palette.text,
      textAnchor: "middle", lineHeight: subFit.lineHeight, height: subFit.height,
    });

    layoutTree.nodes.push({
      type: "rect",
      x: 340, y: 400, width: 600, height: 160,
      fill: palette.cardBg, stroke: palette.cardBorder, strokeWidth: 1, rx: 10, ry: 10,
    });

    layoutTree.nodes.push({
      type: "text",
      x: 640, y: 440,
      text: "Next Steps & Implementation Timeline",
      fontSize: 18, fontFace: "Cambria", fontWeight: "bold", fill: palette.primary, textAnchor: "middle",
    });

    const detailText = "Contact project lead for detailed audit documentation and technical appendix.";
    const detailFit = TextLayoutEngine.fitText(detailText, 540, 60, 14, 11, "Calibri", "normal", 2);
    layoutTree.nodes.push({
      type: "textBlock",
      x: 640, y: 485,
      lines: detailFit.lines,
      fontSize: detailFit.fontSize, fontFace: "Calibri", fill: palette.text,
      textAnchor: "middle", lineHeight: detailFit.lineHeight, height: detailFit.height,
    });
  }

  /**
   * KPI Slide with Dynamic Card Sizing derived from measured text content.
   */
  static layoutKpiSlide(layoutTree, slideContent, palette, fontScaleReduction = 0) {
    const rawMetrics = slideContent.metrics && slideContent.metrics.length > 0
      ? slideContent.metrics
      : [
          { label: "Target Growth", value: "85%", detail: "Year-over-year operational expansion" },
          { label: "Cost Efficiency", value: "64%", detail: "Resource overhead reduction" },
          { label: "Portfolio Yield", value: "$4.2M", detail: "Verified annual return baseline" },
        ];

    const count = Math.min(4, Math.max(1, rawMetrics.length));
    const totalW = 1160;
    const gap = 20;
    const cardW = Math.floor((totalW - (count - 1) * gap) / count);
    const startY = 160;

    // First pass: measure text lines to compute dynamic container card height
    let maxContentHeight = 240;
    const measuredCards = rawMetrics.slice(0, count).map(m => {
      const labelText = (m.label || "METRIC").toUpperCase();
      const labelFit = TextLayoutEngine.fitText(labelText, cardW - 40, 30, 12 - fontScaleReduction, 10, "Calibri", "bold", 1);

      const valText = String(m.value || "100%");
      const valFit = TextLayoutEngine.fitText(valText, cardW - 40, 60, 30 - fontScaleReduction, 16, "Cambria", "bold", 1);

      const bullets = m.detail ? [m.detail] : (slideContent.bullets || ["Verified performance metric."]);
      const bulletFits = bullets.slice(0, 4).map(b => TextLayoutEngine.fitText(`• ${b}`, cardW - 40, 70, 14 - fontScaleReduction, 11, "Calibri", "normal", 3));

      const totalBulletH = bulletFits.reduce((acc, bf) => acc + bf.height + 12, 0);
      const cardH = 140 + totalBulletH + 30; // Dynamic box height equation

      maxContentHeight = Math.max(maxContentHeight, cardH);
      return { labelFit, valFit, bulletFits };
    });

    const dynamicCardH = Math.min(480, Math.max(380, maxContentHeight));

    rawMetrics.slice(0, count).forEach((m, i) => {
      const cx = 60 + i * (cardW + gap);
      const { labelFit, valFit, bulletFits } = measuredCards[i];

      // Dynamic Card Container Rect
      layoutTree.nodes.push({
        type: "rect",
        x: cx, y: startY, width: cardW, height: dynamicCardH,
        fill: palette.cardBg, stroke: palette.cardBorder, strokeWidth: 1, rx: 10, ry: 10,
      });

      // Label Node
      layoutTree.nodes.push({
        type: "textBlock",
        x: cx + 20, y: startY + 30,
        lines: labelFit.lines,
        fontSize: labelFit.fontSize, fontFace: "Calibri", fontWeight: "bold", fill: palette.muted,
        lineHeight: labelFit.lineHeight, height: labelFit.height,
      });

      // Value Node
      layoutTree.nodes.push({
        type: "textBlock",
        x: cx + 20, y: startY + 70,
        lines: valFit.lines,
        fontSize: valFit.fontSize, fontFace: "Cambria", fontWeight: "bold", fill: palette.primary,
        lineHeight: valFit.lineHeight, height: valFit.height,
      });

      // Card Inner Divider Line
      layoutTree.nodes.push({
        type: "line",
        x1: cx + 20, y1: startY + 135, x2: cx + cardW - 20, y2: startY + 135,
        stroke: palette.cardBorder, strokeWidth: 1,
      });

      // Bullet Nodes
      let bulletY = startY + 160;
      bulletFits.forEach(bFit => {
        layoutTree.nodes.push({
          type: "textBlock",
          x: cx + 20, y: bulletY,
          lines: bFit.lines,
          fontSize: bFit.fontSize, fontFace: "Calibri", fill: palette.text,
          lineHeight: bFit.lineHeight, height: bFit.height,
        });
        bulletY += bFit.height + 12;
      });
    });
  }

  static layoutTwoColumnSlide(layoutTree, slideContent, palette, fontScaleReduction = 0) {
    const leftTitle = "Key Findings & Observations";
    const rightTitle = "Strategic Recommendations";
    const bullets = slideContent.bullets || [];

    const leftBullets = bullets.slice(0, Math.ceil(bullets.length / 2));
    const rightBullets = bullets.slice(Math.ceil(bullets.length / 2));

    const cardW = 560;
    const startY = 160;

    // Measure bullet heights to compute dynamic card height
    const measureListHeight = (list) => {
      const font = 14 - fontScaleReduction;
      return list.map(b => TextLayoutEngine.fitText(`• ${b}`, cardW - 50, 100, font, 11, "Calibri", "normal", 3))
        .reduce((acc, fit) => acc + fit.height + 18, 0);
    };

    const leftHeight = measureListHeight(leftBullets.length > 0 ? leftBullets : ["Primary operational metrics indicate steady velocity."]);
    const rightHeight = measureListHeight(rightBullets.length > 0 ? rightBullets : ["Optimize debt servicing structures to reduce overhead."]);
    const dynamicCardH = Math.min(480, Math.max(380, Math.max(leftHeight, rightHeight) + 90));

    // Left Column
    layoutTree.nodes.push({
      type: "rect",
      x: 60, y: startY, width: cardW, height: dynamicCardH,
      fill: palette.cardBg, stroke: palette.cardBorder, strokeWidth: 1, rx: 10, ry: 10,
    });
    layoutTree.nodes.push({
      type: "text",
      x: 85, y: startY + 35,
      text: leftTitle,
      fontSize: 18 - fontScaleReduction, fontFace: "Cambria", fontWeight: "bold", fill: palette.primary,
    });

    let lY = startY + 75;
    (leftBullets.length > 0 ? leftBullets : ["Primary operational metrics indicate steady portfolio velocity.", "Cash flow stability supported by reserves."]).forEach(b => {
      const fit = TextLayoutEngine.fitText(`• ${b}`, cardW - 50, 100, 14 - fontScaleReduction, 11, "Calibri", "normal", 3);
      layoutTree.nodes.push({
        type: "textBlock",
        x: 85, y: lY,
        lines: fit.lines,
        fontSize: fit.fontSize, fontFace: "Calibri", fill: palette.text, lineHeight: fit.lineHeight, height: fit.height,
      });
      lY += fit.height + 18;
    });

    // Right Column
    layoutTree.nodes.push({
      type: "rect",
      x: 660, y: startY, width: cardW, height: dynamicCardH,
      fill: palette.cardBg, stroke: palette.cardBorder, strokeWidth: 1, rx: 10, ry: 10,
    });
    layoutTree.nodes.push({
      type: "text",
      x: 685, y: startY + 35,
      text: rightTitle,
      fontSize: 18 - fontScaleReduction, fontFace: "Cambria", fontWeight: "bold", fill: palette.primary,
    });

    let rY = startY + 75;
    (rightBullets.length > 0 ? rightBullets : ["Optimize debt servicing structures to reduce annual overhead.", "Implement automated audit trails for transaction verification."]).forEach(b => {
      const fit = TextLayoutEngine.fitText(`• ${b}`, cardW - 50, 100, 14 - fontScaleReduction, 11, "Calibri", "normal", 3);
      layoutTree.nodes.push({
        type: "textBlock",
        x: 685, y: rY,
        lines: fit.lines,
        fontSize: fit.fontSize, fontFace: "Calibri", fill: palette.text, lineHeight: fit.lineHeight, height: fit.height,
      });
      rY += fit.height + 18;
    });
  }

  static layoutChartSlide(layoutTree, slideContent, palette, fontScaleReduction = 0) {
    const chartData = slideContent.chart || {
      type: "bar",
      categories: ["Cat A", "Cat B", "Cat C", "Cat D"],
      series: [{ name: "Performance", values: [85, 72, 90, 64] }]
    };

    const cType = (chartData.type || "bar").toLowerCase();
    const categories = (chartData.categories && chartData.categories.length > 0)
      ? chartData.categories
      : ["Category A", "Category B", "Category C", "Category D"];
    const values = (chartData.series && chartData.series[0] && Array.isArray(chartData.series[0].values))
      ? chartData.series[0].values
      : [85, 70, 92, 64];

    const chartColors = [
      palette.primary || "#F5A623",
      palette.secondary || "#008080",
      "#2ECC71",
      "#E74C3C",
      "#9B59B6",
      "#3498DB",
      "#F1C40F"
    ];

    const startY = 160;
    const cardW = 1160;
    const cardH = 480;

    // Main Card Container
    layoutTree.nodes.push({
      type: "rect",
      x: 60, y: startY, width: cardW, height: cardH,
      fill: palette.cardBg, stroke: palette.cardBorder, strokeWidth: 1, rx: 10, ry: 10,
    });

    if (cType === "pie" || cType === "donut") {
      // ── Donut / Pie Chart Layout ──────────────────────────────────────────
      const cx = 330;
      const cy = startY + 240;
      const outerR = 155;
      const innerR = cType === "donut" ? 75 : 0;

      const totalVal = values.reduce((a, b) => a + (Number(b) || 0), 0) || 1;
      let startAngle = -Math.PI / 2;

      values.slice(0, 6).forEach((val, i) => {
        const slicePct = (Number(val) || 0) / totalVal;
        const angleSize = slicePct * 2 * Math.PI;
        const endAngle = startAngle + angleSize;

        const x1Out = cx + outerR * Math.cos(startAngle);
        const y1Out = cy + outerR * Math.sin(startAngle);
        const x2Out = cx + outerR * Math.cos(endAngle);
        const y2Out = cy + outerR * Math.sin(endAngle);

        const x2In = cx + innerR * Math.cos(endAngle);
        const y2In = cy + innerR * Math.sin(endAngle);
        const x1In = cx + innerR * Math.cos(startAngle);
        const y1In = cy + innerR * Math.sin(startAngle);

        const largeArc = angleSize > Math.PI ? 1 : 0;
        const pathColor = chartColors[i % chartColors.length];

        let pathD = "";
        if (innerR > 0) {
          pathD = `M ${x1Out.toFixed(1)} ${y1Out.toFixed(1)} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2Out.toFixed(1)} ${y2Out.toFixed(1)} L ${x2In.toFixed(1)} ${y2In.toFixed(1)} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x1In.toFixed(1)} ${y1In.toFixed(1)} Z`;
        } else {
          pathD = `M ${cx} ${cy} L ${x1Out.toFixed(1)} ${y1Out.toFixed(1)} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2Out.toFixed(1)} ${y2Out.toFixed(1)} Z`;
        }

        layoutTree.nodes.push({ type: "path", d: pathD, fill: pathColor, stroke: palette.cardBg, strokeWidth: 2 });
        startAngle = endAngle;
      });

      if (innerR > 0) {
        // Center Total Circle Badge
        layoutTree.nodes.push({ type: "circle", cx, cy, r: innerR - 2, fill: palette.cardBg });
        layoutTree.nodes.push({
          type: "text", x: cx, y: cy - 8,
          text: "TOTAL", fontSize: 11, fontFace: "Calibri", fontWeight: "bold", fill: palette.muted, textAnchor: "middle",
        });
        const formattedTotal = totalVal >= 1000 ? `${(totalVal/1000).toFixed(1)}K` : String(totalVal);
        layoutTree.nodes.push({
          type: "text", x: cx, y: cy + 16,
          text: formattedTotal, fontSize: 20, fontFace: "Cambria", fontWeight: "bold", fill: palette.primary, textAnchor: "middle",
        });
      }

      // Right Legend & Percentage Breakdown Cards
      const legX = 580;
      const legW = 600;
      let legY = startY + 40;
      const count = Math.min(6, categories.length);
      const rowH = Math.min(65, Math.floor(380 / count));

      categories.slice(0, count).forEach((cat, i) => {
        const val = values[i] || 0;
        const pct = Math.round((val / totalVal) * 100);
        const color = chartColors[i % chartColors.length];

        layoutTree.nodes.push({
          type: "rect", x: legX, y: legY, width: legW - 40, height: rowH - 10,
          fill: palette.background, stroke: palette.cardBorder, strokeWidth: 1, rx: 6, ry: 6,
        });
        layoutTree.nodes.push({
          type: "rect", x: legX + 15, y: legY + 15, width: 16, height: 16,
          fill: color, rx: 4, ry: 4,
        });

        const catFit = TextLayoutEngine.fitText(cat, legW - 200, 24, 14 - fontScaleReduction, 11, "Calibri", "bold", 1);
        layoutTree.nodes.push({
          type: "textBlock", x: legX + 45, y: legY + 13,
          lines: catFit.lines, fontSize: catFit.fontSize, fontFace: "Calibri", fontWeight: "bold", fill: palette.text,
          lineHeight: catFit.lineHeight, height: catFit.height,
        });

        layoutTree.nodes.push({
          type: "text", x: legX + legW - 65, y: legY + 28,
          text: `${val} (${pct}%)`, fontSize: 15 - fontScaleReduction, fontFace: "Cambria", fontWeight: "bold", fill: color, textAnchor: "end",
        });

        legY += rowH;
      });

    } else if (cType === "line" || cType === "area") {
      // ── Line / Trend Chart Layout ─────────────────────────────────────────
      const chartX = 100;
      const chartY = startY + 60;
      const chartW = 700;
      const chartH = 340;

      const count = Math.min(8, categories.length);
      const maxVal = Math.max(...values, 10);
      const points = [];

      // Grid Lines
      for (let g = 0; g <= 4; g++) {
        const gy = chartY + chartH - (g / 4) * chartH;
        const gVal = Math.round((g / 4) * maxVal);
        layoutTree.nodes.push({ type: "line", x1: chartX, y1: gy, x2: chartX + chartW, y2: gy, stroke: palette.cardBorder, strokeWidth: 1 });
        layoutTree.nodes.push({ type: "text", x: chartX - 10, y: gy + 4, text: String(gVal), fontSize: 11, fontFace: "Calibri", fill: palette.muted, textAnchor: "end" });
      }

      // X Axis Points
      const xStep = chartW / Math.max(1, count - 1);
      categories.slice(0, count).forEach((cat, i) => {
        const px = chartX + i * xStep;
        const val = values[i] || 0;
        const py = chartY + chartH - (val / maxVal) * chartH;
        points.push({ x: px, y: py, val, cat });

        layoutTree.nodes.push({
          type: "text", x: px, y: chartY + chartH + 25,
          text: cat.length > 12 ? cat.slice(0, 10) + "…" : cat,
          fontSize: 11, fontFace: "Calibri", fontWeight: "bold", fill: palette.text, textAnchor: "middle",
        });
      });

      // SVG Line Path
      if (points.length > 1) {
        const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
        layoutTree.nodes.push({ type: "path", d: pathD, stroke: palette.primary, strokeWidth: 4, fill: "none" });
      }

      // Plot Circular Data Nodes
      points.forEach(p => {
        layoutTree.nodes.push({ type: "circle", cx: p.x, cy: p.y, r: 6, fill: palette.primary, stroke: palette.cardBg, strokeWidth: 2 });
        layoutTree.nodes.push({
          type: "text", x: p.x, y: p.y - 12,
          text: String(p.val), fontSize: 12, fontFace: "Calibri", fontWeight: "bold", fill: palette.text, textAnchor: "middle",
        });
      });

      // Right Insight Card
      const rightX = 850;
      layoutTree.nodes.push({
        type: "rect", x: rightX, y: startY + 40, width: 330, height: 380,
        fill: palette.background, stroke: palette.cardBorder, strokeWidth: 1, rx: 8, ry: 8,
      });
      layoutTree.nodes.push({
        type: "text", x: rightX + 20, y: startY + 75,
        text: "TREND ANALYSIS", fontSize: 12, fontFace: "Calibri", fontWeight: "bold", fill: palette.muted,
      });
      const peak = points.reduce((m, p) => p.val > m.val ? p : m, points[0] || { val: 0, cat: "N/A" });
      layoutTree.nodes.push({
        type: "text", x: rightX + 20, y: startY + 115,
        text: "Peak Milestone", fontSize: 13, fontFace: "Calibri", fill: palette.muted,
      });
      layoutTree.nodes.push({
        type: "text", x: rightX + 20, y: startY + 145,
        text: `${peak.cat}: ${peak.val}`, fontSize: 18, fontFace: "Cambria", fontWeight: "bold", fill: palette.primary,
      });

    } else if (cType === "radar") {
      // ── Radar Mesh Chart Layout ───────────────────────────────────────────
      const cx = 330;
      const cy = startY + 240;
      const maxR = 150;
      const count = Math.min(6, categories.length);
      const angleStep = (2 * Math.PI) / Math.max(3, count);

      // Web Rings
      [0.33, 0.66, 1.0].forEach(rRatio => {
        const ringPoints = [];
        for (let i = 0; i < count; i++) {
          const a = -Math.PI / 2 + i * angleStep;
          const rx = cx + maxR * rRatio * Math.cos(a);
          const ry = cy + maxR * rRatio * Math.sin(a);
          ringPoints.push(`${rx.toFixed(1)},${ry.toFixed(1)}`);
        }
        layoutTree.nodes.push({ type: "polygon", points: ringPoints.join(" "), stroke: palette.cardBorder, strokeWidth: 1, fill: "none" });
      });

      // Axis Lines & Radar Value Polygon
      const maxVal = Math.max(...values, 100);
      const radarPoints = [];

      for (let i = 0; i < count; i++) {
        const a = -Math.PI / 2 + i * angleStep;
        const ax = cx + maxR * Math.cos(a);
        const ay = cy + maxR * Math.sin(a);
        layoutTree.nodes.push({ type: "line", x1: cx, y1: cy, x2: ax, y2: ay, stroke: palette.cardBorder, strokeWidth: 1 });

        const labelDist = maxR + 25;
        const lx = cx + labelDist * Math.cos(a);
        const ly = cy + labelDist * Math.sin(a);
        layoutTree.nodes.push({
          type: "text", x: lx, y: ly + 4,
          text: categories[i] || `Point ${i + 1}`, fontSize: 11, fontFace: "Calibri", fontWeight: "bold", fill: palette.text, textAnchor: "middle",
        });

        const val = values[i] || 50;
        const valR = maxR * (val / maxVal);
        const vx = cx + valR * Math.cos(a);
        const vy = cy + valR * Math.sin(a);
        radarPoints.push(`${vx.toFixed(1)},${vy.toFixed(1)}`);
      }

      layoutTree.nodes.push({ type: "polygon", points: radarPoints.join(" "), fill: palette.primary, opacity: 0.35, stroke: palette.primary, strokeWidth: 2 });

      // Right Side Breakdown
      const legX = 580;
      const legW = 600;
      let legY = startY + 40;
      const rowH = Math.min(65, Math.floor(380 / count));
      categories.slice(0, count).forEach((cat, i) => {
        const val = values[i] || 0;
        layoutTree.nodes.push({
          type: "rect", x: legX, y: legY, width: legW - 40, height: rowH - 10,
          fill: palette.background, stroke: palette.cardBorder, strokeWidth: 1, rx: 6, ry: 6,
        });
        layoutTree.nodes.push({
          type: "text", x: legX + 20, y: legY + 28,
          text: cat, fontSize: 13, fontFace: "Calibri", fontWeight: "bold", fill: palette.text,
        });
        layoutTree.nodes.push({
          type: "text", x: legX + legW - 65, y: legY + 28,
          text: `${val}`, fontSize: 15, fontFace: "Cambria", fontWeight: "bold", fill: palette.primary, textAnchor: "end",
        });
        legY += rowH;
      });

    } else {
      // ── Bar / Column Multi-Color Layout ────────────────────────────────────
      const maxVal = Math.max(...values, 100);
      const labelX = 80;
      const barStartX = 300;
      const maxBarW = 720;
      const count = Math.min(5, categories.length);
      let barY = startY + 40;

      categories.slice(0, count).forEach((cat, idx) => {
        const val = values[idx] || 50;
        const barW = Math.round((val / maxVal) * maxBarW);
        const color = chartColors[idx % chartColors.length];

        const catFit = TextLayoutEngine.fitText(cat, 200, 30, 14 - fontScaleReduction, 11, "Calibri", "bold", 1);
        layoutTree.nodes.push({
          type: "textBlock", x: labelX, y: barY + 6,
          lines: catFit.lines, fontSize: catFit.fontSize, fontFace: "Calibri", fontWeight: "bold", fill: palette.text,
          lineHeight: catFit.lineHeight, height: catFit.height,
        });

        layoutTree.nodes.push({
          type: "rect", x: barStartX, y: barY, width: Math.max(10, barW), height: 32,
          fill: color, rx: 6, ry: 6,
        });

        layoutTree.nodes.push({
          type: "text", x: barStartX + Math.max(10, barW) + 15, y: barY + 22,
          text: `${val}`, fontSize: 14 - fontScaleReduction, fontFace: "Calibri", fontWeight: "bold", fill: palette.text,
        });

        barY += 75;
      });
    }
  }

  static layoutSwotSlide(layoutTree, slideContent, palette, fontScaleReduction = 0) {
    const quads = slideContent.quadrants || {};
    const bullets = slideContent.bullets || [];

    const fallbackS = bullets[0] ? [bullets[0], "Verified high completion rate for target cases"] : ["High surgical completion rate for identified cases", "Effective screening across primary blocks"];
    const fallbackW = bullets[1] ? [bullets[1], "Reporting discrepancies in specific regional blocks"] : ["Data entry errors (0% reported for completed cases)", "Pending follow-ups for unresolved conditions"];
    const fallbackO = bullets[2] ? [bullets[2], "Automation of tracking pipelines"] : ["Digital data validation to eliminate reporting errors", "Expanded referral network for specialized care"];
    const fallbackT = ["Reporting lag during peak volume periods", "Incomplete documentation from partner facilities"];

    const items = [
      { title: "STRENGTHS", color: "#27AE60", list: (quads.strengths && quads.strengths.length > 0) ? quads.strengths : fallbackS },
      { title: "WEAKNESSES", color: "#E74C3C", list: (quads.weaknesses && quads.weaknesses.length > 0) ? quads.weaknesses : fallbackW },
      { title: "OPPORTUNITIES", color: "#2980B9", list: (quads.opportunities && quads.opportunities.length > 0) ? quads.opportunities : fallbackO },
      { title: "THREATS", color: "#E67E22", list: (quads.threats && quads.threats.length > 0) ? quads.threats : fallbackT },
    ];

    const cardW = 560;
    const cardH = 210;

    const positions = [
      { x: 60, y: 160 },
      { x: 660, y: 160 },
      { x: 60, y: 400 },
      { x: 660, y: 400 },
    ];

    items.forEach((item, idx) => {
      const pos = positions[idx];
      layoutTree.nodes.push({
        type: "rect", x: pos.x, y: pos.y, width: cardW, height: cardH,
        fill: palette.cardBg, stroke: item.color, strokeWidth: 2, rx: 8, ry: 8,
      });

      layoutTree.nodes.push({
        type: "text", x: pos.x + 25, y: pos.y + 35,
        text: item.title, fontSize: 16 - fontScaleReduction, fontFace: "Cambria", fontWeight: "bold", fill: item.color,
      });

      let lineY = pos.y + 70;
      item.list.slice(0, 3).forEach(b => {
        const fit = TextLayoutEngine.fitText(`• ${b}`, cardW - 50, 45, 14 - fontScaleReduction, 11, "Calibri", "normal", 2);
        layoutTree.nodes.push({
          type: "textBlock", x: pos.x + 25, y: lineY,
          lines: fit.lines, fontSize: fit.fontSize, fontFace: "Calibri", fill: palette.text,
          lineHeight: fit.lineHeight, height: fit.height,
        });
        lineY += fit.height + 10;
      });
    });
  }

  static layoutRecommendationsSlide(layoutTree, slideContent, palette, fontScaleReduction = 0) {
    const cards = Array.isArray(slideContent.cards) ? slideContent.cards.filter(c => c && (c.title || c.detail)) : [];
    const bullets = Array.isArray(slideContent.bullets) ? slideContent.bullets.filter(Boolean) : [];
    const steps = Array.isArray(slideContent.steps) ? slideContent.steps.filter(Boolean) : [];

    let rawRecs = [];
    if (cards.length > 0) {
      rawRecs = cards;
    } else if (bullets.length > 0) {
      rawRecs = bullets.map((b, i) => ({ title: `Strategic Recommendation 0${i + 1}`, value: `0${i + 1}`, detail: b }));
    } else if (steps.length > 0) {
      rawRecs = steps.map((s, i) => ({ title: s.title || `Action Step 0${i + 1}`, value: `0${i + 1}`, detail: s.description || s.title }));
    } else {
      rawRecs = [
        { title: "Operational Tracking & Quality Audit", value: "01", detail: slideContent.title || "Implement continuous review mechanisms to ensure data integrity." },
        { title: "Resource & Program Expansion", value: "02", detail: slideContent.subtitle || "Prioritize high-impact target areas and optimize intervention delivery." },
        { title: "Governance & Reporting Integration", value: "03", detail: "Streamline reporting pipelines across administrative blocks to eliminate data gaps." },
      ];
    }

    let rowY = 160;
    const rowW = 1160;

    rawRecs.slice(0, 3).forEach((r, idx) => {
      const tFit = TextLayoutEngine.fitText(r.title || `Recommendation 0${idx + 1}`, rowW - 180, 35, 18 - fontScaleReduction, 13, "Cambria", "bold", 1);
      const dFit = TextLayoutEngine.fitText(r.detail || r.title || "Action item recommendation detail.", rowW - 180, 50, 14 - fontScaleReduction, 11, "Calibri", "normal", 2);

      const dynamicRowH = Math.max(115, Math.min(145, 55 + dFit.height));

      layoutTree.nodes.push({
        type: "rect", x: 60, y: rowY, width: rowW, height: dynamicRowH,
        fill: palette.cardBg, stroke: palette.cardBorder, strokeWidth: 1, rx: 8, ry: 8,
      });

      layoutTree.nodes.push({
        type: "rect", x: 80, y: rowY + 20, width: 45, height: 45,
        fill: palette.primary, rx: 6, ry: 6,
      });
      layoutTree.nodes.push({
        type: "text", x: 102, y: rowY + 48,
        text: r.value || `0${idx + 1}`,
        fontSize: 18 - fontScaleReduction, fontFace: "Cambria", fontWeight: "bold", fill: palette.textDark, textAnchor: "middle",
      });

      layoutTree.nodes.push({
        type: "textBlock", x: 145, y: rowY + 35,
        lines: tFit.lines, fontSize: tFit.fontSize, fontFace: "Cambria", fontWeight: "bold", fill: palette.primary,
        lineHeight: tFit.lineHeight, height: tFit.height,
      });

      layoutTree.nodes.push({
        type: "textBlock", x: 145, y: rowY + 68,
        lines: dFit.lines, fontSize: dFit.fontSize, fontFace: "Calibri", fill: palette.text,
        lineHeight: dFit.lineHeight, height: dFit.height,
      });

      rowY += dynamicRowH + 18;
    });
  }

  static layoutScorecardSlide(layoutTree, slideContent, palette, fontScaleReduction = 0) {
    this.layoutSwotSlide(layoutTree, slideContent, palette, fontScaleReduction);
  }

  /**
   * Executive Summary Layout with Dynamic Container Auto-Expansion & Dynamic Spacing.
   */
  static layoutExecutiveSummarySlide(layoutTree, slideContent, palette, fontScaleReduction = 0) {
    const rawMetrics = slideContent.metrics || [
      { label: "Target Growth", value: "85%", detail: "Operational expansion" },
      { label: "Cost Efficiency", value: "64%", detail: "Overhead reduction" },
      { label: "Portfolio Yield", value: "$4.2M", detail: "Annual return baseline" },
    ];

    const count = Math.min(3, rawMetrics.length);
    const totalW = 1160;
    const gap = 20;
    const cardW = Math.floor((totalW - (count - 1) * gap) / count);

    rawMetrics.slice(0, count).forEach((m, i) => {
      const cx = 60 + i * (cardW + gap);
      layoutTree.nodes.push({
        type: "rect",
        x: cx, y: 160, width: cardW, height: 130,
        fill: palette.cardBg, stroke: palette.cardBorder, strokeWidth: 1, rx: 8, ry: 8,
      });

      const labelFit = TextLayoutEngine.fitText((m.label || `METRIC ${i + 1}`).toUpperCase(), cardW - 30, 25, 11 - fontScaleReduction, 10, "Calibri", "bold", 1);
      layoutTree.nodes.push({
        type: "textBlock",
        x: cx + 20, y: 195,
        lines: labelFit.lines,
        fontSize: labelFit.fontSize, fontFace: "Calibri", fontWeight: "bold", fill: palette.muted, lineHeight: labelFit.lineHeight, height: labelFit.height,
      });

      const valFit = TextLayoutEngine.fitText(String(m.value || "100%"), cardW - 30, 45, 22 - fontScaleReduction, 14, "Cambria", "bold", 1);
      layoutTree.nodes.push({
        type: "textBlock",
        x: cx + 20, y: 230,
        lines: valFit.lines,
        fontSize: valFit.fontSize, fontFace: "Cambria", fontWeight: "bold", fill: palette.primary, lineHeight: valFit.lineHeight, height: valFit.height,
      });
    });

    // Executive Summary Bottom Box - Dynamic Container Sizing
    const bullets = slideContent.bullets || [
      "Strategic analysis generated from primary financial statement data and account records.",
      "Key operational risk indicators, cash flow velocity, and account liquidity verified.",
      "Actionable recommendations prioritized based on debt structure and compliance rules.",
    ];

    const bulletFits = bullets.slice(0, 4).map(b => TextLayoutEngine.fitText(`• ${b}`, 1100, 50, 14 - fontScaleReduction, 11, "Calibri", "normal", 2));
    const totalBulletsH = bulletFits.reduce((acc, fit) => acc + fit.height + 15, 0);

    const dynamicBoxH = Math.min(340, Math.max(260, 60 + totalBulletsH));

    layoutTree.nodes.push({
      type: "rect",
      x: 60, y: 310, width: 1160, height: dynamicBoxH,
      fill: palette.cardBg, stroke: palette.cardBorder, strokeWidth: 1, rx: 10, ry: 10,
    });

    layoutTree.nodes.push({
      type: "text",
      x: 90, y: 350,
      text: "Executive Summary & Key Insights",
      fontSize: 18 - fontScaleReduction, fontFace: "Cambria", fontWeight: "bold", fill: palette.primary,
    });

    let bY = 385;
    bulletFits.forEach(fit => {
      layoutTree.nodes.push({
        type: "textBlock",
        x: 90, y: bY,
        lines: fit.lines,
        fontSize: fit.fontSize, fontFace: "Calibri", fill: palette.text, lineHeight: fit.lineHeight, height: fit.height,
      });
      bY += fit.height + 15;
    });
  }
}

module.exports = LayoutPlanner;
