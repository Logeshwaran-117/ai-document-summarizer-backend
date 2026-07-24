/**
 * LayoutPlanner.js
 * Automatic Layout Planner for SVG presentation slides.
 * Computes exact coordinate geometry, dynamic container sizing, iterative reflow, and safe area constraints.
 */

const TextLayoutEngine = require("./TextLayoutEngine");
const ConstraintEngine = require("./ConstraintEngine");
const ContentNormalizer = require("./ContentNormalizer");
const VisualValidator = require("./VisualValidator");
const { resolveThemePalette } = require("./ThemeRegistry");

class LayoutPlanner {
  /**
   * Main entry point with strict content normalization, iterative reflow, and visual validation.
   */
  static computeSlideLayout(rawSlideContent, themeName = "Professional", slideIndex = 0, totalSlides = 10) {
    // 1. Content Normalization
    const slideContent = ContentNormalizer.normalizeSlideContent(rawSlideContent);
    const palette = resolveThemePalette(themeName);

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
      case "table":
        this.layoutTableSlide(layoutTree, slideContent, palette, fontScaleReduction);
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
      x: 640, y: 390,
      lines: subFit.lines,
      fontSize: subFit.fontSize,
      fontFace: "Calibri", fill: palette.text,
      textAnchor: "middle", lineHeight: subFit.lineHeight, height: subFit.height,
    });

    layoutTree.nodes.push({
      type: "line",
      x1: 440, y1: 470, x2: 840, y2: 470,
      stroke: palette.primary, strokeWidth: 3,
    });

    layoutTree.nodes.push({
      type: "text",
      x: 640, y: 520,
      text: author,
      fontSize: 13, fontFace: "Calibri", fontWeight: "bold", fill: palette.muted,
      textAnchor: "middle",
    });
  }

  static layoutClosingSlide(layoutTree, slideContent, palette, fontScaleReduction = 0) {
    const title = slideContent.title || "Thank You";
    const subtitle = slideContent.subtitle || "Questions & Discussion";

    layoutTree.nodes.push({
      type: "text",
      x: 640, y: 300,
      text: title,
      fontSize: 44 - fontScaleReduction, fontFace: "Cambria", fontWeight: "bold", fill: palette.primary,
      textAnchor: "middle",
    });

    layoutTree.nodes.push({
      type: "text",
      x: 640, y: 370,
      text: subtitle,
      fontSize: 20 - fontScaleReduction, fontFace: "Calibri", fill: palette.text,
      textAnchor: "middle",
    });
  }

  static layoutExecutiveSummarySlide(layoutTree, slideContent, palette, fontScaleReduction = 0) {
    const bullets = slideContent.bullets && slideContent.bullets.length > 0
      ? slideContent.bullets
      : [
          "Operational metrics indicate strong alignment across primary target goals.",
          "Strategic compliance verified across active implementation channels.",
          "Key risk factors mitigated through automated workflow monitoring.",
        ];

    const cardW = 1160;
    const startY = 160;

    let totalBulletH = 0;
    const fits = bullets.map(b => {
      const fit = TextLayoutEngine.fitText(`• ${b}`, cardW - 60, 100, 16 - fontScaleReduction, 12, "Calibri", "normal", 3);
      totalBulletH += fit.height + 16;
      return fit;
    });

    const dynamicCardH = Math.min(480, Math.max(340, totalBulletH + 80));

    layoutTree.nodes.push({
      type: "rect",
      x: 60, y: startY, width: cardW, height: dynamicCardH,
      fill: palette.cardBg, stroke: palette.cardBorder, strokeWidth: 1, rx: 10, ry: 10,
    });

    layoutTree.nodes.push({
      type: "text",
      x: 90, y: startY + 40,
      text: "Executive Summary & Key Insights",
      fontSize: 18 - fontScaleReduction, fontFace: "Cambria", fontWeight: "bold", fill: palette.primary,
    });

    let currentY = startY + 80;
    fits.forEach(fit => {
      layoutTree.nodes.push({
        type: "textBlock",
        x: 90, y: currentY,
        lines: fit.lines,
        fontSize: fit.fontSize, fontFace: "Calibri", fill: palette.text,
        lineHeight: fit.lineHeight, height: fit.height,
      });
      currentY += fit.height + 16;
    });
  }

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

    let maxContentHeight = 240;
    const measuredCards = rawMetrics.slice(0, count).map(m => {
      const labelText = (m.label || "METRIC").toUpperCase();
      const labelFit = TextLayoutEngine.fitText(labelText, cardW - 40, 30, 12 - fontScaleReduction, 10, "Calibri", "bold", 1);

      const valText = String(m.value || "100%");
      const valFit = TextLayoutEngine.fitText(valText, cardW - 40, 60, 30 - fontScaleReduction, 16, "Cambria", "bold", 1);

      const bullets = m.detail ? [m.detail] : (slideContent.bullets || ["Verified performance metric."]);
      const bulletFits = bullets.slice(0, 4).map(b => TextLayoutEngine.fitText(`• ${b}`, cardW - 40, 70, 14 - fontScaleReduction, 11, "Calibri", "normal", 3));

      const totalBulletH = bulletFits.reduce((acc, bf) => acc + bf.height + 12, 0);
      const cardH = 140 + totalBulletH + 30;

      maxContentHeight = Math.max(maxContentHeight, cardH);
      return { labelFit, valFit, bulletFits };
    });

    const dynamicCardH = Math.min(480, Math.max(380, maxContentHeight));

    rawMetrics.slice(0, count).forEach((m, i) => {
      const cx = 60 + i * (cardW + gap);
      const { labelFit, valFit, bulletFits } = measuredCards[i];

      layoutTree.nodes.push({
        type: "rect",
        x: cx, y: startY, width: cardW, height: dynamicCardH,
        fill: palette.cardBg, stroke: palette.cardBorder, strokeWidth: 1, rx: 10, ry: 10,
      });

      layoutTree.nodes.push({
        type: "textBlock",
        x: cx + 20, y: startY + 30,
        lines: labelFit.lines,
        fontSize: labelFit.fontSize, fontFace: "Calibri", fontWeight: "bold", fill: palette.muted,
        lineHeight: labelFit.lineHeight, height: labelFit.height,
      });

      layoutTree.nodes.push({
        type: "textBlock",
        x: cx + 20, y: startY + 70,
        lines: valFit.lines,
        fontSize: valFit.fontSize, fontFace: "Cambria", fontWeight: "bold", fill: palette.primary,
        lineHeight: valFit.lineHeight, height: valFit.height,
      });

      layoutTree.nodes.push({
        type: "line",
        x1: cx + 20, y1: startY + 135, x2: cx + cardW - 20, y2: startY + 135,
        stroke: palette.cardBorder, strokeWidth: 1,
      });

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

  /**
   * 2-Column Chart Slide: Left Chart Graphic + Right Takeaway Wording & Key Insights Panel
   */
  static layoutChartSlide(layoutTree, slideContent, palette, fontScaleReduction = 0) {
    const chartData = slideContent.chart || {
      type: "bar",
      categories: ["Sector A", "Sector B", "Sector C", "Sector D"],
      series: [{ name: "Performance", values: [85, 72, 90, 64] }]
    };

    const cType = (chartData.type || "bar").toLowerCase();
    const categories = (chartData.categories && chartData.categories.length > 0)
      ? chartData.categories
      : ["Sector A", "Sector B", "Sector C", "Sector D"];
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
    const leftW = 680;
    const rightW = 460;
    const cardH = 480;

    // 1. Left Graphic Card Container
    layoutTree.nodes.push({
      type: "rect",
      x: 60, y: startY, width: leftW, height: cardH,
      fill: palette.cardBg, stroke: palette.cardBorder, strokeWidth: 1, rx: 10, ry: 10,
    });

    if (cType === "pie" || cType === "donut") {
      const cx = 60 + leftW / 2;
      const cy = startY + 240;
      const outerR = 140;
      const innerR = cType === "donut" ? 65 : 0;
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
        layoutTree.nodes.push({ type: "circle", cx, cy, r: innerR - 2, fill: palette.cardBg });
        layoutTree.nodes.push({
          type: "text", x: cx, y: cy - 6,
          text: "TOTAL", fontSize: 10, fontFace: "Calibri", fontWeight: "bold", fill: palette.muted, textAnchor: "middle",
        });
        const formattedTotal = totalVal >= 1000 ? `${(totalVal/1000).toFixed(1)}K` : String(totalVal);
        layoutTree.nodes.push({
          type: "text", x: cx, y: cy + 14,
          text: formattedTotal, fontSize: 18, fontFace: "Cambria", fontWeight: "bold", fill: palette.primary, textAnchor: "middle",
        });
      }

    } else if (cType === "line" || cType === "area") {
      const chartX = 110;
      const chartY = startY + 60;
      const chartW = 580;
      const chartH = 340;
      const count = Math.min(6, categories.length);
      const maxVal = Math.max(...values, 10);
      const points = [];

      for (let g = 0; g <= 4; g++) {
        const gy = chartY + chartH - (g / 4) * chartH;
        const gVal = Math.round((g / 4) * maxVal);
        layoutTree.nodes.push({ type: "line", x1: chartX, y1: gy, x2: chartX + chartW, y2: gy, stroke: palette.cardBorder, strokeWidth: 1 });
        layoutTree.nodes.push({ type: "text", x: chartX - 10, y: gy + 4, text: String(gVal), fontSize: 10, fontFace: "Calibri", fill: palette.muted, textAnchor: "end" });
      }

      const xStep = chartW / Math.max(1, count - 1);
      categories.slice(0, count).forEach((cat, i) => {
        const px = chartX + i * xStep;
        const val = values[i] || 0;
        const py = chartY + chartH - (val / maxVal) * chartH;
        points.push({ x: px, y: py, val, cat });

        layoutTree.nodes.push({
          type: "text", x: px, y: chartY + chartH + 22,
          text: cat.length > 10 ? cat.slice(0, 8) + "…" : cat,
          fontSize: 10, fontFace: "Calibri", fontWeight: "bold", fill: palette.text, textAnchor: "middle",
        });
      });

      if (points.length > 1) {
        const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
        layoutTree.nodes.push({ type: "path", d: pathD, stroke: palette.primary, strokeWidth: 4, fill: "none" });
      }

      points.forEach(p => {
        layoutTree.nodes.push({ type: "circle", cx: p.x, cy: p.y, r: 5, fill: palette.primary, stroke: palette.cardBg, strokeWidth: 2 });
        layoutTree.nodes.push({
          type: "text", x: p.x, y: p.y - 10,
          text: String(p.val), fontSize: 11, fontFace: "Calibri", fontWeight: "bold", fill: palette.text, textAnchor: "middle",
        });
      });

    } else {
      // Bar / Column Chart Layout inside 680px card
      const maxVal = Math.max(...values, 10);
      const labelX = 85;
      const barStartX = 240;
      const maxBarW = 440;
      const count = Math.min(5, categories.length);
      let barY = startY + 40;

      categories.slice(0, count).forEach((cat, idx) => {
        const val = values[idx] || 50;
        const barW = Math.round((val / maxVal) * maxBarW);
        const color = chartColors[idx % chartColors.length];

        const catFit = TextLayoutEngine.fitText(cat, 140, 30, 12 - fontScaleReduction, 10, "Calibri", "bold", 1);
        layoutTree.nodes.push({
          type: "textBlock", x: labelX, y: barY + 6,
          lines: catFit.lines, fontSize: catFit.fontSize, fontFace: "Calibri", fontWeight: "bold", fill: palette.text,
          lineHeight: catFit.lineHeight, height: catFit.height,
        });

        layoutTree.nodes.push({
          type: "rect", x: barStartX, y: barY, width: Math.max(10, barW), height: 28,
          fill: color, rx: 5, ry: 5,
        });

        layoutTree.nodes.push({
          type: "text", x: barStartX + Math.max(10, barW) + 12, y: barY + 19,
          text: `${val}`, fontSize: 13 - fontScaleReduction, fontFace: "Calibri", fontWeight: "bold", fill: palette.text,
        });

        barY += 75;
      });
    }

    // 2. Right Wording & Key Insights Panel Container
    const rightX = 760;
    layoutTree.nodes.push({
      type: "rect",
      x: rightX, y: startY, width: rightW, height: cardH,
      fill: palette.cardBg, stroke: palette.cardBorder, strokeWidth: 1, rx: 10, ry: 10,
    });

    layoutTree.nodes.push({
      type: "text",
      x: rightX + 25, y: startY + 35,
      text: "KEY TAKEAWAYS & DATA INSIGHTS",
      fontSize: 14 - fontScaleReduction, fontFace: "Cambria", fontWeight: "bold", fill: palette.primary,
    });

    layoutTree.nodes.push({
      type: "line",
      x1: rightX + 25, y1: startY + 50, x2: rightX + rightW - 25, y2: startY + 50,
      stroke: palette.cardBorder, strokeWidth: 1,
    });

    // Bullets / Takeaway Wording
    const bullets = (slideContent.bullets && slideContent.bullets.length > 0)
      ? slideContent.bullets
      : [
          `Highest performance recorded in ${categories[0] || 'primary sector'} with ${values[0] || 0} unit cases.`,
          `Average target baseline maintained across active reporting blocks.`,
          `Strategic measures established to enhance ongoing coverage accuracy.`,
        ];

    let bY = startY + 75;
    bullets.slice(0, 4).forEach(b => {
      const fit = TextLayoutEngine.fitText(`• ${b}`, rightW - 50, 80, 13 - fontScaleReduction, 10, "Calibri", "normal", 3);
      layoutTree.nodes.push({
        type: "textBlock",
        x: rightX + 25, y: bY,
        lines: fit.lines,
        fontSize: fit.fontSize, fontFace: "Calibri", fill: palette.text,
        lineHeight: fit.lineHeight, height: fit.height,
      });
      bY += fit.height + 14;
    });

    // Peak Metric Badge at bottom of wording panel
    const peakIdx = values.reduce((maxI, val, i, arr) => (val > arr[maxI] ? i : maxI), 0);
    const peakCat = categories[peakIdx] || "Primary Sector";
    const peakVal = values[peakIdx] || 0;

    layoutTree.nodes.push({
      type: "rect",
      x: rightX + 25, y: startY + cardH - 85, width: rightW - 50, height: 60,
      fill: palette.background, stroke: palette.cardBorder, strokeWidth: 1, rx: 8, ry: 8,
    });

    layoutTree.nodes.push({
      type: "text",
      x: rightX + 45, y: startY + cardH - 60,
      text: `TOP PERFORMER: ${peakCat.toUpperCase()}`,
      fontSize: 11, fontFace: "Calibri", fontWeight: "bold", fill: palette.muted,
    });

    layoutTree.nodes.push({
      type: "text",
      x: rightX + 45, y: startY + cardH - 38,
      text: `${peakVal} Cases / Volume`,
      fontSize: 16, fontFace: "Cambria", fontWeight: "bold", fill: palette.primary,
    });
  }

  /**
   * Executive Table Slide Layout Engine
   */
  static layoutTableSlide(layoutTree, slideContent, palette, fontScaleReduction = 0) {
    const tableData = slideContent.table || {
      headers: ["Reporting Unit / Sector", "Target Volume", "Coverage Rate", "Status & Remarks"],
      rows: [
        ["Sector A", "560", "99.8%", "Verified"],
        ["Sector B", "645", "103%", "Above Target"],
        ["Sector C", "520", "99.0%", "Verified"],
        ["Sector D", "680", "98.5%", "Verified"]
      ]
    };

    const headers = tableData.headers && tableData.headers.length > 0
      ? tableData.headers
      : ["Reporting Unit / Sector", "Target Volume", "Coverage Rate", "Status & Remarks"];

    const rows = tableData.rows && tableData.rows.length > 0
      ? tableData.rows
      : [
          ["Sector A", "560", "99.8%", "Verified"],
          ["Sector B", "645", "103%", "Above Target"],
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

    const colCount = Math.min(5, Math.max(2, headers.length));
    const colW = Math.floor(cardW / colCount);

    // Header Band
    layoutTree.nodes.push({
      type: "rect",
      x: 60, y: startY, width: cardW, height: 48,
      fill: palette.primary, rx: 8, ry: 8,
    });

    headers.slice(0, colCount).forEach((h, colIdx) => {
      const cx = 60 + colIdx * colW + 15;
      layoutTree.nodes.push({
        type: "text",
        x: cx, y: startY + 30,
        text: String(h).toUpperCase().slice(0, 24),
        fontSize: 12 - fontScaleReduction, fontFace: "Calibri", fontWeight: "bold",
        fill: palette.textDark || "#0F1B38",
      });
    });

    // Table Data Rows
    const rowCount = Math.min(7, rows.length);
    const rowH = Math.floor((cardH - 55) / Math.max(1, rowCount));

    rows.slice(0, rowCount).forEach((row, rowIdx) => {
      const ry = startY + 50 + rowIdx * rowH;
      const bgFill = rowIdx % 2 === 0 ? palette.cardBg : palette.background;

      layoutTree.nodes.push({
        type: "rect",
        x: 60, y: ry, width: cardW, height: rowH - 2,
        fill: bgFill, stroke: palette.cardBorder, strokeWidth: 1,
      });

      const cells = Array.isArray(row) ? row : [String(row)];
      cells.slice(0, colCount).forEach((cellText, colIdx) => {
        const cx = 60 + colIdx * colW + 15;
        const textStr = String(cellText).trim();

        // Check if status cell (e.g. Over Target, Near Target, Below Target, Critical Gap, Verified)
        const isStatusCell = colIdx === colCount - 1 || /Over Target|Near Target|Below Target|Critical Gap|Verified|Target Met|Pending/i.test(textStr);

        if (isStatusCell && textStr.length < 20) {
          let badgeBg = "#E2E8F0";
          let badgeText = "#475569";
          if (/Over Target|Target Met|Verified/i.test(textStr)) { badgeBg = "#EBF3FF"; badgeText = "#0077B6"; }
          else if (/Near Target/i.test(textStr)) { badgeBg = "#F1F5F9"; badgeText = "#475569"; }
          else if (/Below Target/i.test(textStr)) { badgeBg = "#FFF3E0"; badgeText = "#E67E22"; }
          else if (/Critical/i.test(textStr)) { badgeBg = "#FFEBEE"; badgeText = "#C0392B"; }

          const badgeW = Math.min(colW - 30, Math.max(100, textStr.length * 8 + 20));
          const badgeH = 26;
          const badgeY = ry + Math.floor((rowH - badgeH) / 2);

          layoutTree.nodes.push({
            type: "rect", x: cx, y: badgeY, width: badgeW, height: badgeH,
            fill: badgeBg, rx: 6, ry: 6,
          });

          layoutTree.nodes.push({
            type: "text",
            x: cx + badgeW / 2, y: badgeY + 18,
            text: textStr,
            fontSize: 11, fontFace: "Calibri", fontWeight: "bold",
            fill: badgeText, textAnchor: "middle",
          });
        } else {
          const fit = TextLayoutEngine.fitText(textStr, colW - 30, rowH - 10, 13 - fontScaleReduction, 10, "Calibri", colIdx === 0 ? "bold" : "normal", 1);
          layoutTree.nodes.push({
            type: "textBlock",
            x: cx, y: ry + Math.max(6, Math.floor((rowH - fit.height) / 2)),
            lines: fit.lines,
            fontSize: fit.fontSize, fontFace: "Calibri",
            fontWeight: colIdx === 0 ? "bold" : "normal",
            fill: colIdx === 0 ? palette.primary : palette.text,
            lineHeight: fit.lineHeight, height: fit.height,
          });
        }
      });
    });
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
          lines: fit.lines,
          fontSize: fit.fontSize, fontFace: "Calibri", fill: palette.text,
          lineHeight: fit.lineHeight, height: fit.height,
        });
        lineY += fit.height + 10;
      });
    });
  }

  static layoutProcessSlide(layoutTree, slideContent, palette, fontScaleReduction = 0) {
    const rawSteps = slideContent.steps && slideContent.steps.length > 0
      ? slideContent.steps
      : [
          { stepNumber: "01", title: "Assessment", description: "Initial data collection & auditing." },
          { stepNumber: "02", title: "Formulation", description: "Strategy development & target setting." },
          { stepNumber: "03", title: "Execution", description: "Implementation of operational control measures." },
        ];

    const count = Math.min(4, Math.max(1, rawSteps.length));
    const totalW = 1160;
    const gap = 20;
    const cardW = Math.floor((totalW - (count - 1) * gap) / count);
    const startY = 160;
    const cardH = 480;

    rawSteps.slice(0, count).forEach((step, i) => {
      const cx = 60 + i * (cardW + gap);
      layoutTree.nodes.push({
        type: "rect",
        x: cx, y: startY, width: cardW, height: cardH,
        fill: palette.cardBg, stroke: palette.cardBorder, strokeWidth: 1, rx: 10, ry: 10,
      });

      // Step Number Pill
      layoutTree.nodes.push({
        type: "rect",
        x: cx + 20, y: startY + 25, width: 50, height: 50,
        fill: palette.primary, rx: 25, ry: 25,
      });
      layoutTree.nodes.push({
        type: "text",
        x: cx + 45, y: startY + 56,
        text: String(step.stepNumber || i + 1),
        fontSize: 18 - fontScaleReduction, fontFace: "Cambria", fontWeight: "bold", fill: palette.textDark || "#0F1B38",
        textAnchor: "middle",
      });

      // Title
      const titleFit = TextLayoutEngine.fitText(step.title || `Phase ${i + 1}`, cardW - 40, 50, 16 - fontScaleReduction, 12, "Cambria", "bold", 2);
      layoutTree.nodes.push({
        type: "textBlock",
        x: cx + 20, y: startY + 95,
        lines: titleFit.lines,
        fontSize: titleFit.fontSize, fontFace: "Cambria", fontWeight: "bold", fill: palette.text,
        lineHeight: titleFit.lineHeight, height: titleFit.height,
      });

      layoutTree.nodes.push({
        type: "line",
        x1: cx + 20, y1: startY + 155, x2: cx + cardW - 20, y2: startY + 155,
        stroke: palette.cardBorder, strokeWidth: 1,
      });

      // Description
      const descFit = TextLayoutEngine.fitText(step.description || "Operational execution item.", cardW - 40, 260, 14 - fontScaleReduction, 11, "Calibri", "normal", 8);
      layoutTree.nodes.push({
        type: "textBlock",
        x: cx + 20, y: startY + 175,
        lines: descFit.lines,
        fontSize: descFit.fontSize, fontFace: "Calibri", fill: palette.text,
        lineHeight: descFit.lineHeight, height: descFit.height,
      });
    });
  }

  static layoutRecommendationsSlide(layoutTree, slideContent, palette, fontScaleReduction = 0) {
    const rawCards = slideContent.cards && slideContent.cards.length > 0
      ? slideContent.cards
      : [
          { title: "Strategic Recommendation 01", value: "01", detail: "Enhance operational compliance monitoring across regional blocks." },
          { title: "Governance Task 02", value: "02", detail: "Automate tracking pipelines to eliminate data entry lag." },
        ];

    const count = Math.min(4, Math.max(1, rawCards.length));
    const cardW = 560;
    const cardH = 215;

    const positions = [
      { x: 60, y: 160 },
      { x: 660, y: 160 },
      { x: 60, y: 405 },
      { x: 660, y: 405 },
    ];

    rawCards.slice(0, count).forEach((card, i) => {
      const pos = positions[i];
      layoutTree.nodes.push({
        type: "rect", x: pos.x, y: pos.y, width: cardW, height: cardH,
        fill: palette.cardBg, stroke: palette.cardBorder, strokeWidth: 1, rx: 10, ry: 10,
      });

      // Left Accent Number Tag Box
      layoutTree.nodes.push({
        type: "rect", x: pos.x, y: pos.y, width: 80, height: cardH,
        fill: palette.primary, rx: 10, ry: 10,
      });
      layoutTree.nodes.push({
        type: "text", x: pos.x + 40, y: pos.y + cardH / 2 + 8,
        text: String(card.value || i + 1).padStart(2, "0"),
        fontSize: 24, fontFace: "Cambria", fontWeight: "bold", fill: palette.textDark || "#0F1B38",
        textAnchor: "middle",
      });

      // Title
      const titleFit = TextLayoutEngine.fitText(card.title || "Action Item", cardW - 110, 40, 16 - fontScaleReduction, 12, "Cambria", "bold", 1);
      layoutTree.nodes.push({
        type: "textBlock", x: pos.x + 98, y: pos.y + 25,
        lines: titleFit.lines, fontSize: titleFit.fontSize, fontFace: "Cambria", fontWeight: "bold", fill: palette.primary,
        lineHeight: titleFit.lineHeight, height: titleFit.height,
      });

      // Detail
      const descFit = TextLayoutEngine.fitText(card.detail || "Strategic action measure.", cardW - 110, 120, 13 - fontScaleReduction, 10, "Calibri", "normal", 4);
      layoutTree.nodes.push({
        type: "textBlock", x: pos.x + 98, y: pos.y + 70,
        lines: descFit.lines, fontSize: descFit.fontSize, fontFace: "Calibri", fill: palette.text,
        lineHeight: descFit.lineHeight, height: descFit.height,
      });
    });
  }

  static layoutScorecardSlide(layoutTree, slideContent, palette, fontScaleReduction = 0) {
    const rawMetrics = slideContent.metrics && slideContent.metrics.length > 0
      ? slideContent.metrics
      : [
          { label: "MR I Immunization Rate", value: "99.8%", detail: "Target Achieved" },
          { label: "MR II Follow-up Rate", value: "92.4%", detail: "In Progress" },
          { label: "Case Investigation Rate", value: "85%", detail: "Target Met" },
        ];

    const cardW = 1160;
    const startY = 160;
    const count = Math.min(5, rawMetrics.length);
    const rowH = Math.floor(480 / Math.max(1, count));

    layoutTree.nodes.push({
      type: "rect", x: 60, y: startY, width: cardW, height: 480,
      fill: palette.cardBg, stroke: palette.cardBorder, strokeWidth: 1, rx: 10, ry: 10,
    });

    rawMetrics.slice(0, count).forEach((m, i) => {
      const ry = startY + i * rowH;
      layoutTree.nodes.push({
        type: "line", x1: 60, y1: ry + rowH, x2: 1220, y2: ry + rowH,
        stroke: palette.cardBorder, strokeWidth: 1,
      });

      // Metric Label
      const labelFit = TextLayoutEngine.fitText(m.label || "KPI METRIC", 450, 30, 15 - fontScaleReduction, 12, "Calibri", "bold", 1);
      layoutTree.nodes.push({
        type: "textBlock", x: 90, y: ry + Math.floor((rowH - labelFit.height) / 2),
        lines: labelFit.lines, fontSize: labelFit.fontSize, fontFace: "Calibri", fontWeight: "bold", fill: palette.text,
        lineHeight: labelFit.lineHeight, height: labelFit.height,
      });

      // Metric Value
      layoutTree.nodes.push({
        type: "text", x: 750, y: ry + Math.floor(rowH / 2) + 6,
        text: String(m.value || "100%"), fontSize: 20 - fontScaleReduction, fontFace: "Cambria", fontWeight: "bold", fill: palette.primary,
      });

      // Status Tag Badge
      const statusText = m.detail || "Verified";
      layoutTree.nodes.push({
        type: "rect", x: 960, y: ry + Math.floor(rowH / 2) - 15, width: 200, height: 30,
        fill: palette.background, stroke: palette.cardBorder, strokeWidth: 1, rx: 6, ry: 6,
      });
      layoutTree.nodes.push({
        type: "text", x: 1060, y: ry + Math.floor(rowH / 2) + 5,
        text: statusText, fontSize: 11, fontFace: "Calibri", fontWeight: "bold", fill: palette.primary, textAnchor: "middle",
      });
    });
  }
}

module.exports = LayoutPlanner;
