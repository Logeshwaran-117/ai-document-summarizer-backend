/**
 * pptExport.js
 * Component-based PowerPoint (.pptx) generator.
 * Composes presentation slides from modular components in ../components.
 */

const pptxgen = require("pptxgenjs");
const { resolveTheme } = require("../themes");
const LayoutSelector = require("../renderer/layoutSelector");
const DryRunSimulator = require("../renderer/dryRunSimulator");

// Component Library
const {
  TitleComponent,
  MetricCardComponent,
  TableComponent,
  ChartComponent,
  TimelineComponent,
  ProcessArrowComponent,
  ComparisonComponent,
  QuoteComponent,
  FooterComponent,
  ImageCardComponent,
} = require("../components");

async function exportToPptx(presentationModel, outputPath) {
  console.log(`🖼️ [pptExport] Composing presentation to PPTX: ${outputPath}`);

  // Run dry-run bounding box simulation prior to rendering
  DryRunSimulator.simulateAndAdjust(presentationModel);

  const ppt = new pptxgen();
  ppt.layout = "LAYOUT_16x9";

  // Native Document Metadata
  ppt.title = presentationModel.metadata.title || "Presentation";
  ppt.subject = presentationModel.metadata.subject || "Document Analysis";
  ppt.author = presentationModel.metadata.author || "AI Document Summarizer";
  ppt.company = presentationModel.metadata.company || "Executive Report";
  ppt.revision = presentationModel.metadata.version || "2.0";

  const theme = resolveTheme(presentationModel.theme.name);

  // Render each slide using modular components
  (presentationModel.slides || []).forEach((slideData, idx) => {
    const slide = ppt.addSlide();
    const layoutKey = LayoutSelector.selectBestLayout(slideData);

    const isTitle = layoutKey === "title" || slideData.type === "title" || slideData.type === "cover";

    // Slide Background Fill
    slide.background = { color: isTitle ? theme.bgDark : theme.bgLight };

    // 1. Render Title / Header Block
    TitleComponent.render(slide, slideData, theme, { isTitleSlide: isTitle });

    if (!isTitle) {
      const startY = slideData.keyInsight ? 2.05 : 1.55;
      const availH = 4.8 - startY;

      // 2. Render Content Elements by Component Type
      if (slideData.cards && slideData.cards.length > 0) {
        MetricCardComponent.renderGrid(slide, slideData.cards, theme, startY, availH);
      } else if (slideData.chart) {
        ChartComponent.render(slide, slideData.chart, theme, startY, availH);
      } else if (slideData.table) {
        TableComponent.render(slide, slideData.table, theme, startY, availH);
      } else if (slideData.processSteps && slideData.processSteps.length > 0) {
        ProcessArrowComponent.render(slide, slideData.processSteps, theme, startY, availH);
      } else if (slideData.twoColumns || slideData.type === "twocolumn") {
        ComparisonComponent.render(slide, slideData.twoColumns || slideData, theme, startY, availH);
      } else if (slideData.quote) {
        QuoteComponent.render(slide, slideData.quote, theme, startY, availH);
      } else if (slideData.bullets && slideData.bullets.length > 0) {
        this.renderBullets(slide, slideData.bullets, theme, startY, availH);
      }

      // 3. Render Slide Footer
      FooterComponent.render(slide, presentationModel, idx + 1, presentationModel.slides.length, theme);
    }
  });

  await ppt.writeFile({ fileName: outputPath });
  console.log(`✅ [pptExport] PPTX composed successfully: ${outputPath}`);
  return outputPath;
}

function renderBullets(slide, bullets, theme, startY, availH) {
  const bulletItems = bullets.slice(0, 7).map(b => {
    const isLead = b.includes("**") && b.includes(":");
    return {
      text: b,
      options: {
        fontSize: isLead ? 12.5 : 12,
        color: theme.textDark,
        bullet: { code: "25AA", color: theme.teal },
        spaceAfter: 10,
      },
    };
  });

  slide.addText(bulletItems, {
    x: 0.8,
    y: startY,
    w: 11.7,
    h: availH,
    fontFace: theme.fonts.body,
    valign: "top",
  });
}

module.exports = { exportToPptx };
