/**
 * layouts/metadata.js
 * Layout preview, limits, priorities, and capabilities metadata.
 */

module.exports = {
  title: {
    id: "title",
    label: "Title Cover",
    maxBullets: 0,
    maxCards: 0,
    supportsCharts: false,
    priority: 100,
  },
  executiveSummary: {
    id: "executiveSummary",
    label: "Executive Summary",
    maxBullets: 4,
    maxCards: 3,
    supportsCharts: false,
    priority: 95,
  },
  comparison: {
    id: "comparison",
    label: "Side-by-Side Comparison",
    maxBullets: 6,
    maxCards: 4,
    supportsCharts: false,
    priority: 90,
  },
  cards: {
    id: "cards",
    label: "KPI Grid Cards",
    maxBullets: 0,
    maxCards: 6,
    supportsCharts: false,
    priority: 90,
  },
  dashboard: {
    id: "dashboard",
    label: "Multi-Metric Dashboard",
    maxBullets: 3,
    maxCards: 4,
    supportsCharts: true,
    priority: 85,
  },
  timeline: {
    id: "timeline",
    label: "Process Timeline",
    maxBullets: 0,
    maxCards: 0,
    supportsCharts: false,
    priority: 85,
  },
  table: {
    id: "table",
    label: "Data Table",
    maxBullets: 2,
    maxCards: 0,
    supportsCharts: false,
    priority: 85,
  },
  quote: {
    id: "quote",
    label: "Executive Callout Quote",
    maxBullets: 0,
    maxCards: 0,
    supportsCharts: false,
    priority: 80,
  },
  chart: {
    id: "chart",
    label: "Analytical Chart",
    maxBullets: 3,
    maxCards: 2,
    supportsCharts: true,
    priority: 90,
  },
};
