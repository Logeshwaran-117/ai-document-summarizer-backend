/**
 * chartCleaner.js
 * Extractor, normalizer, currency & percentage formatter, and chart dataset sanitizer.
 */

class ChartCleaner {
  static sanitizeChart(chart) {
    if (!chart || typeof chart !== "object") return null;

    let categories = Array.isArray(chart.categories) ? chart.categories.map(c => String(c).slice(0, 30)) : [];
    let series = Array.isArray(chart.series) ? chart.series : [];

    if (categories.length === 0 || series.length === 0) return null;

    // Clean values in series
    const cleanedSeries = series.map(s => {
      const name = String(s.name || "Series").slice(0, 30);
      const rawValues = Array.isArray(s.values) ? s.values : [];
      const values = rawValues.map(val => this.normalizeNumber(val));
      return { name, values };
    }).filter(s => s.values.length > 0);

    if (cleanedSeries.length === 0) return null;

    // Align length of categories and series values
    const minLen = Math.min(categories.length, Math.max(...cleanedSeries.map(s => s.values.length)));
    categories = categories.slice(0, minLen);
    cleanedSeries.forEach(s => {
      s.values = s.values.slice(0, minLen);
    });

    return {
      chartType: ["bar", "pie", "donut", "line"].includes(chart.chartType) ? chart.chartType : "bar",
      title: chart.title || "Data Summary",
      categories,
      series: cleanedSeries,
      unit: chart.unit || "",
    };
  }

  static normalizeNumber(val) {
    if (typeof val === "number") return isNaN(val) ? 0 : val;
    if (!val || typeof val !== "string") return 0;
    const cleaned = val.replace(/[^0-9.-]/g, "");
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }
}

module.exports = ChartCleaner;
