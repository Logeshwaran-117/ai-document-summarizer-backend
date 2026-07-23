/**
 * pptExport.js
 * Generates native PowerPoint (.pptx) file from PresentationModel using pptxgenjs.
 */

const pptxgen = require("pptxgenjs");
const { resolveTheme } = require("../themes");
const LayoutSelector = require("../renderer/layoutSelector");
const OverflowOptimizer = require("../renderer/overflowOptimizer");

async function exportToPptx(presentationModel, outputPath) {
  console.log(`🖼️ [pptExport] Rendering presentation to PPTX: ${outputPath}`);

  const ppt = new pptxgen();
  ppt.layout = "LAYOUT_16x9";

  // Native Document Metadata
  ppt.title = presentationModel.metadata.title || "Presentation";
  ppt.subject = presentationModel.metadata.subject || "Document Analysis";
  ppt.author = presentationModel.metadata.author || "AI Document Summarizer";
  ppt.company = presentationModel.metadata.company || "Executive Report";
  ppt.revision = presentationModel.metadata.version || "1.0";

  const theme = resolveTheme(presentationModel.theme.name);

  // Render each slide
  (presentationModel.slides || []).forEach((slideData, idx) => {
    const slide = ppt.addSlide();
    const layoutKey = LayoutSelector.selectBestLayout(slideData);

    // Slide Background
    if (layoutKey === "title") {
      slide.background = { color: theme.bgDark };
      renderTitleSlide(slide, slideData, theme);
    } else {
      slide.background = { color: theme.bgLight };
      renderContentSlide(slide, slideData, theme, layoutKey, idx + 1, presentationModel.slides.length);
    }
  });

  await ppt.writeFile({ fileName: outputPath });
  console.log(`✅ [pptExport] PPTX generated successfully: ${outputPath}`);
  return outputPath;
}

function renderTitleSlide(slide, slideData, theme) {
  // Title
  slide.addText(slideData.headline || "Document Presentation", {
    x: 0.8, y: 2.2, w: 11.5, h: 1.5,
    fontSize: 40, bold: true, color: theme.textLight, fontFace: theme.fonts.title,
  });

  // Subtitle
  if (slideData.subtitle) {
    slide.addText(slideData.subtitle, {
      x: 0.8, y: 3.8, w: 11.5, h: 0.8,
      fontSize: 20, color: theme.accent, fontFace: theme.fonts.body,
    });
  }

  // Accent Line
  slide.addShape(slide.shapes.RECTANGLE, {
    x: 0.8, y: 4.8, w: 2.5, h: 0.08, fill: { color: theme.accent }
  });
}

function renderContentSlide(slide, slideData, theme, layoutKey, slideNum, totalSlides) {
  // Header Category / Badge
  slide.addText(`EXECUTIVE REPORT`, {
    x: 0.8, y: 0.4, w: 5.0, h: 0.3,
    fontSize: 10, bold: true, color: theme.teal, fontFace: theme.fonts.body
  });

  // Action Headline
  const optHeadline = OverflowOptimizer.optimizeText(slideData.headline || "Key Finding", 80, 24);
  slide.addText(optHeadline.text, {
    x: 0.8, y: 0.7, w: 11.5, h: 0.8,
    fontSize: optHeadline.fontSize, bold: true, color: theme.textDark, fontFace: theme.fonts.title
  });

  // Subtitle / Key Insight Bar
  if (slideData.keyInsight) {
    slide.addShape(slide.shapes.RECTANGLE, {
      x: 0.8, y: 1.5, w: 11.7, h: 0.5, fill: { color: theme.cardAlt }, line: { color: theme.border, width: 1 }
    });
    slide.addText(`💡 ${slideData.keyInsight}`, {
      x: 1.0, y: 1.55, w: 11.3, h: 0.4,
      fontSize: 12, italic: true, color: theme.textDark, fontFace: theme.fonts.body
    });
  }

  const startY = slideData.keyInsight ? 2.2 : 1.6;

  // Layout Rendering Logic
  if (layoutKey === "cards" || (slideData.cards && slideData.cards.length > 0)) {
    renderCardsLayout(slide, slideData.cards, theme, startY);
  } else if (slideData.chart) {
    renderChartLayout(slide, slideData.chart, theme, startY);
  } else {
    renderBulletsLayout(slide, slideData.bullets, theme, startY);
  }

  // Footer
  slide.addText(`${slideNum} / ${totalSlides}`, {
    x: 11.5, y: 7.0, w: 1.0, h: 0.3,
    fontSize: 10, color: theme.textMuted, align: "right"
  });
}

function renderCardsLayout(slide, cards, theme, startY) {
  const count = Math.min(cards.length, 6);
  const cols = count <= 3 ? count : 3;
  const cardW = 3.6;
  const cardH = 1.8;
  const gapX = 0.4;
  const gapY = 0.3;

  cards.slice(0, 6).forEach((card, idx) => {
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    const x = 0.8 + c * (cardW + gapX);
    const y = startY + r * (cardH + gapY);

    // Card background
    slide.addShape(slide.shapes.ROUNDED_RECTANGLE, {
      x, y, w: cardW, h: cardH, rectRadius: 0.05,
      fill: { color: theme.cardBg }, line: { color: theme.border, width: 1 }
    });

    // Metric Value
    slide.addText(card.value || "-", {
      x: x + 0.3, y: y + 0.2, w: cardW - 0.6, h: 0.6,
      fontSize: 26, bold: true, color: theme.textDark
    });

    // Title
    slide.addText(card.title || "Metric", {
      x: x + 0.3, y: y + 0.9, w: cardW - 0.6, h: 0.4,
      fontSize: 13, bold: true, color: theme.teal
    });
  });
}

function renderBulletsLayout(slide, bullets, theme, startY) {
  const bulletItems = (bullets && bullets.length > 0) ? bullets : ["Detailed analysis point"];
  
  const textObjects = bulletItems.map(b => ({
    text: b,
    options: { fontSize: 14, color: theme.textDark, bullet: true, spaceAfter: 12 }
  }));

  slide.addText(textObjects, {
    x: 0.8, y: startY, w: 11.5, h: 4.5,
    fontFace: theme.fonts.body
  });
}

function renderChartLayout(slide, chart, theme, startY) {
  if (!chart || !chart.categories || !chart.series) return;

  const chartData = chart.series.map(s => ({
    name: s.name,
    labels: chart.categories,
    values: s.values
  }));

  const chartTypeMap = {
    bar: slide.charts.BAR,
    pie: slide.charts.PIE,
    donut: slide.charts.DOUGHNUT,
    line: slide.charts.LINE
  };

  const selectedType = chartTypeMap[chart.chartType] || slide.charts.BAR;

  slide.addChart(selectedType, chartData, {
    x: 0.8, y: startY, w: 11.5, h: 4.5,
    showTitle: true, title: chart.title || "Chart Analysis",
    titleColor: theme.textDark, titleFontSize: 14,
    chartColors: theme.chartColors
  });
}

module.exports = { exportToPptx };
