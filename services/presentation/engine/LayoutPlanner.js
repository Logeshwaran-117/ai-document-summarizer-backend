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
      categories: ["Operating Revenue", "Portfolio Yield", "Asset Reserve Ratio", "Cost Efficiency"],
      series: [{ name: "Performance", values: [85, 72, 90, 64] }]
    };

    const categories = chartData.categories || ["Cat A", "Cat B", "Cat C", "Cat D"];
    const values = (chartData.series && chartData.series[0] ? chartData.series[0].values : [80, 65, 90, 70]);

    const cardW = 1160;
    const catCount = Math.min(5, categories.length);
    const dynamicCardH = Math.min(480, Math.max(360, catCount * 75 + 50));
    const startY = 160;

    layoutTree.nodes.push({
      type: "rect",
      x: 60, y: startY, width: cardW, height: dynamicCardH,
      fill: palette.cardBg, stroke: palette.cardBorder, strokeWidth: 1, rx: 10, ry: 10,
    });

    const maxVal = Math.max(...values, 100);
    const labelX = 80;
    const barStartX = 300;
    const maxBarW = 720;
    let barY = startY + 40;

    categories.slice(0, catCount).forEach((cat, idx) => {
      const val = values[idx] || 50;
      const barW = Math.round((val / maxVal) * maxBarW);

      const catFit = TextLayoutEngine.fitText(cat, 200, 30, 14 - fontScaleReduction, 11, "Calibri", "bold", 1);
      layoutTree.nodes.push({
        type: "textBlock",
        x: labelX, y: barY + 6,
        lines: catFit.lines,
        fontSize: catFit.fontSize, fontFace: "Calibri", fontWeight: "bold", fill: palette.text, lineHeight: catFit.lineHeight, height: catFit.height,
      });

      layoutTree.nodes.push({
        type: "rect",
        x: barStartX, y: barY, width: barW, height: 32,
        fill: palette.primary, rx: 6, ry: 6,
      });

      layoutTree.nodes.push({
        type: "text",
        x: barStartX + barW + 15, y: barY + 22,
        text: `${val}%`,
        fontSize: 14 - fontScaleReduction, fontFace: "Calibri", fontWeight: "bold", fill: palette.text,
      });

      barY += 75;
    });
  }

  static layoutSwotSlide(layoutTree, slideContent, palette, fontScaleReduction = 0) {
    const quads = slideContent.quadrants || {};
    const items = [
      { title: "STRENGTHS", color: "#27AE60", list: quads.strengths || ["Strong balance sheet reserves", "Robust risk management framework"] },
      { title: "WEAKNESSES", color: "#E74C3C", list: quads.weaknesses || ["Legacy core processing overhead", "Manual reconciliation bottlenecks"] },
      { title: "OPPORTUNITIES", color: "#2980B9", list: quads.opportunities || ["Automation of credit risk scoring", "Digital account onboarding integration"] },
      { title: "THREATS", color: "#E67E22", list: quads.threats || ["Regulatory compliance cost inflation", "Market liquidity rate fluctuations"] },
    ];

    const cardW = 560;
    const cardH = 220;

    const positions = [
      { x: 60, y: 160 },
      { x: 660, y: 160 },
      { x: 60, y: 410 },
      { x: 660, y: 410 },
    ];

    items.forEach((item, idx) => {
      const pos = positions[idx];
      layoutTree.nodes.push({
        type: "rect",
        x: pos.x, y: pos.y, width: cardW, height: cardH,
        fill: palette.cardBg, stroke: item.color, strokeWidth: 2, rx: 8, ry: 8,
      });

      layoutTree.nodes.push({
        type: "text",
        x: pos.x + 25, y: pos.y + 35,
        text: item.title,
        fontSize: 16 - fontScaleReduction, fontFace: "Cambria", fontWeight: "bold", fill: item.color,
      });

      let lineY = pos.y + 70;
      item.list.slice(0, 3).forEach(b => {
        const fit = TextLayoutEngine.fitText(`• ${b}`, cardW - 50, 45, 14 - fontScaleReduction, 11, "Calibri", "normal", 2);
        layoutTree.nodes.push({
          type: "textBlock",
          x: pos.x + 25, y: lineY,
          lines: fit.lines,
          fontSize: fit.fontSize, fontFace: "Calibri", fill: palette.text, lineHeight: fit.lineHeight, height: fit.height,
        });
        lineY += fit.height + 10;
      });
    });
  }

  static layoutProcessSlide(layoutTree, slideContent, palette, fontScaleReduction = 0) {
    const rawSteps = slideContent.steps && slideContent.steps.length > 0
      ? slideContent.steps
      : [
          { stepNumber: "01", title: "Diagnostic Assessment", description: "Audit core ledger records and identify operational bottlenecks." },
          { stepNumber: "02", title: "Strategy Formulation", description: "Design automated workflow pipelines to streamline processing." },
          { stepNumber: "03", title: "Implementation", description: "Deploy risk scoring models and integrate compliance tracking." },
          { stepNumber: "04", title: "Continuous Review", description: "Monitor quarterly velocity and evaluate liquidity reserves." },
        ];

    const count = Math.min(4, rawSteps.length);
    const cardW = 260;
    const cardH = 440;
    const gap = 40;
    const startY = 180;

    rawSteps.slice(0, count).forEach((step, idx) => {
      const cx = 60 + idx * (cardW + gap);

      layoutTree.nodes.push({
        type: "rect",
        x: cx, y: startY, width: cardW, height: cardH,
        fill: palette.cardBg, stroke: palette.cardBorder, strokeWidth: 1, rx: 10, ry: 10,
      });

      layoutTree.nodes.push({
        type: "rect",
        x: cx + 20, y: startY + 20, width: 45, height: 45,
        fill: palette.primary, rx: 6, ry: 6,
      });
      layoutTree.nodes.push({
        type: "text",
        x: cx + 42, y: startY + 48,
        text: step.stepNumber || `0${idx + 1}`,
        fontSize: 18 - fontScaleReduction, fontFace: "Cambria", fontWeight: "bold", fill: palette.textDark, textAnchor: "middle",
      });

      const tFit = TextLayoutEngine.fitText(step.title, cardW - 40, 50, 16 - fontScaleReduction, 12, "Cambria", "bold", 2);
      layoutTree.nodes.push({
        type: "textBlock",
        x: cx + 20, y: startY + 85,
        lines: tFit.lines,
        fontSize: tFit.fontSize, fontFace: "Cambria", fontWeight: "bold", fill: palette.primary, lineHeight: tFit.lineHeight, height: tFit.height,
      });

      const dFit = TextLayoutEngine.fitText(step.description, cardW - 40, 240, 14 - fontScaleReduction, 11, "Calibri", "normal", 8);
      layoutTree.nodes.push({
        type: "textBlock",
        x: cx + 20, y: startY + 150,
        lines: dFit.lines,
        fontSize: dFit.fontSize, fontFace: "Calibri", fill: palette.text, lineHeight: dFit.lineHeight, height: dFit.height,
      });

      if (idx < count - 1) {
        layoutTree.nodes.push({
          type: "line",
          x1: cx + cardW + 5, y1: startY + 220, x2: cx + cardW + gap - 5, y2: startY + 220,
          stroke: palette.primary, strokeWidth: 3,
        });
      }
    });
  }

  /**
   * Recommendations Layout with Dynamic Row Height Sizing derived from text length.
   */
  static layoutRecommendationsSlide(layoutTree, slideContent, palette, fontScaleReduction = 0) {
    const rawRecs = slideContent.cards || [
      { title: "Immediate Liquidity Optimization", value: "01", detail: "Reallocate short-term reserve capital to high-yield interest accounts to maximize float efficiency." },
      { title: "Automated Reconciliation Pipeline", value: "02", detail: "Deploy structured parser for daily bank ledger entries to eliminate manual audit lag." },
      { title: "Governance & Risk Policy Review", value: "03", detail: "Update internal credit authorization thresholds based on quarterly stress test models." },
    ];

    let rowY = 160;
    const rowW = 1160;

    rawRecs.slice(0, 3).forEach((r, idx) => {
      const tFit = TextLayoutEngine.fitText(r.title, rowW - 180, 35, 18 - fontScaleReduction, 13, "Cambria", "bold", 1);
      const dFit = TextLayoutEngine.fitText(r.detail || r.title, rowW - 180, 50, 14 - fontScaleReduction, 11, "Calibri", "normal", 2);

      // Dynamic Row Height Calculation
      const dynamicRowH = Math.max(115, Math.min(150, 55 + dFit.height));

      layoutTree.nodes.push({
        type: "rect",
        x: 60, y: rowY, width: rowW, height: dynamicRowH,
        fill: palette.cardBg, stroke: palette.cardBorder, strokeWidth: 1, rx: 8, ry: 8,
      });

      layoutTree.nodes.push({
        type: "rect",
        x: 80, y: rowY + 20, width: 45, height: 45,
        fill: palette.primary, rx: 6, ry: 6,
      });
      layoutTree.nodes.push({
        type: "text",
        x: 102, y: rowY + 48,
        text: r.value || `0${idx + 1}`,
        fontSize: 18 - fontScaleReduction, fontFace: "Cambria", fontWeight: "bold", fill: palette.textDark, textAnchor: "middle",
      });

      layoutTree.nodes.push({
        type: "textBlock",
        x: 145, y: rowY + 35,
        lines: tFit.lines,
        fontSize: tFit.fontSize, fontFace: "Cambria", fontWeight: "bold", fill: palette.primary, lineHeight: tFit.lineHeight, height: tFit.height,
      });

      layoutTree.nodes.push({
        type: "textBlock",
        x: 145, y: rowY + 68,
        lines: dFit.lines,
        fontSize: dFit.fontSize, fontFace: "Calibri", fill: palette.text, lineHeight: dFit.lineHeight, height: dFit.height,
      });

      rowY += dynamicRowH + 20;
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
