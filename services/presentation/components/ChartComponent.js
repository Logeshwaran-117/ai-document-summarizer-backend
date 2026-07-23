/**
 * ChartComponent.js
 * Component for rendering multi-type native PPTX charts (Bar, Line, Doughnut, Pie, Radar)
 * with label optimization and insight panels.
 */

const ChartCleaner = require("../utils/chartCleaner");

class ChartComponent {
  static render(slide, rawChart, theme, startY, availH = 3.8) {
    const chart = ChartCleaner.sanitizeChart(rawChart);
    if (!chart || !chart.categories || chart.categories.length === 0 || !chart.series || chart.series.length === 0) {
      return;
    }

    const type = (chart.chartType || "bar").toLowerCase();
    const categories = chart.categories.slice(0, 8);
    const seriesData = chart.series.map(s => ({
      name: String(s.name || "Series").slice(0, 30),
      labels: categories,
      values: (s.values || []).slice(0, categories.length).map(v => (typeof v === "number" && !isNaN(v) ? v : 0)),
    }));

    const chartColors = theme.chartColors || [
      theme.chart1 || "0F1B38",
      theme.chart2 || "F5A623",
      theme.chart3 || "008080",
      theme.chart4 || "E74C3C",
      theme.chart5 || "8E44AD",
    ];

    const w = 7.5;
    const h = Math.min(availH, 4.0);
    const x = 0.8;

    // Select Native Chart Type
    let selectedType = slide.charts.BAR;
    let barDir = "col";
    let isDoughnut = false;

    if (type === "pie") {
      selectedType = slide.charts.PIE;
    } else if (type === "donut" || type === "doughnut") {
      selectedType = slide.charts.DOUGHNUT;
      isDoughnut = true;
    } else if (type === "line") {
      selectedType = slide.charts.LINE;
    } else if (type === "radar") {
      selectedType = slide.charts.RADAR;
    } else if (type === "horizontalbar" || type === "bar_horizontal") {
      selectedType = slide.charts.BAR;
      barDir = "bar";
    }

    const chartOpts = {
      x,
      y: startY,
      w,
      h,
      showTitle: true,
      title: chart.title || "Data Breakdown",
      titleColor: theme.textDark,
      titleFontSize: 12,
      chartColors: chartColors.slice(0, categories.length),
      showLegend: seriesData.length > 1 || isDoughnut,
      legendPos: "r",
      legendFontSize: 9,
      catAxisLabelFontSize: 8.5,
      valAxisLabelFontSize: 8.5,
      catAxisLabelColor: theme.textDark,
      valAxisLabelColor: theme.textMuted,
      valGridLine: { style: "dash", color: theme.border, size: 0.5 },
      plotAreaBorderColor: theme.border,
    };

    if (type === "bar" || type === "horizontalbar") {
      chartOpts.barDir = barDir;
      chartOpts.showValue = true;
      chartOpts.dataLabelFontSize = 8;
      chartOpts.dataLabelPosition = "inEnd";
      chartOpts.dataLabelColor = theme.textLight;
    }

    if (isDoughnut) {
      chartOpts.holeSize = 48;
    }

    try {
      slide.addChart(selectedType, seriesData, chartOpts);
      this.renderInsightPanel(slide, seriesData[0], theme, startY, h);
    } catch (err) {
      console.warn("⚠️ [ChartComponent] Fallback rendering error:", err.message);
    }
  }

  static renderInsightPanel(slide, primarySeries, theme, startY, h) {
    if (!primarySeries || !primarySeries.values || primarySeries.values.length === 0) return;

    const values = primarySeries.values;
    const labels = primarySeries.labels;
    const maxIdx = values.reduce((maxI, val, i, arr) => (val > arr[maxI] ? i : maxI), 0);
    const minIdx = values.reduce((minI, val, i, arr) => (val < arr[minI] ? i : minI), 0);
    const sum = values.reduce((a, b) => a + b, 0);

    const panelX = 8.6;
    const panelW = 3.9;

    // Container Card
    slide.addShape(slide.shapes.ROUNDED_RECTANGLE, {
      x: panelX,
      y: startY,
      w: panelW,
      h,
      rectRadius: 0.05,
      fill: { color: theme.cardAlt },
      line: { color: theme.border, width: 1 },
    });

    // Panel Header
    slide.addText("DATA INSIGHTS", {
      x: panelX + 0.2,
      y: startY + 0.15,
      w: panelW - 0.4,
      h: 0.28,
      fontSize: 9,
      bold: true,
      color: theme.teal,
      fontFace: theme.fonts.body,
      charSpacing: 1,
    });

    // Highest Item
    slide.addText("TOP PERFORMER", {
      x: panelX + 0.2,
      y: startY + 0.55,
      w: panelW - 0.4,
      h: 0.22,
      fontSize: 8,
      color: theme.textMuted,
      fontFace: theme.fonts.body,
    });
    slide.addText(`${labels[maxIdx]} (${values[maxIdx]})`, {
      x: panelX + 0.2,
      y: startY + 0.78,
      w: panelW - 0.4,
      h: 0.35,
      fontSize: 12,
      bold: true,
      color: theme.accent,
      fontFace: theme.fonts.title,
    });

    // Lowest Item
    slide.addText("LOWEST RECORD", {
      x: panelX + 0.2,
      y: startY + 1.25,
      w: panelW - 0.4,
      h: 0.22,
      fontSize: 8,
      color: theme.textMuted,
      fontFace: theme.fonts.body,
    });
    slide.addText(`${labels[minIdx]} (${values[minIdx]})`, {
      x: panelX + 0.2,
      y: startY + 1.48,
      w: panelW - 0.4,
      h: 0.35,
      fontSize: 12,
      bold: true,
      color: theme.textDark,
      fontFace: theme.fonts.title,
    });

    // Total Metric Callout
    if (sum > 0) {
      slide.addText("TOTAL ACCUMULATED", {
        x: panelX + 0.2,
        y: startY + 2.0,
        w: panelW - 0.4,
        h: 0.22,
        fontSize: 8,
        color: theme.textMuted,
        fontFace: theme.fonts.body,
      });
      slide.addText(String(sum), {
        x: panelX + 0.2,
        y: startY + 2.25,
        w: panelW - 0.4,
        h: 0.4,
        fontSize: 18,
        bold: true,
        color: theme.teal,
        fontFace: theme.fonts.title,
      });
    }
  }
}

module.exports = ChartComponent;
