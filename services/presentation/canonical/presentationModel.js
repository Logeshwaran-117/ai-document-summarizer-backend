/**
 * presentationModel.js
 * Canonical schema for Presentation & Slide data objects.
 */

class SlideModel {
  constructor(data = {}) {
    this.id = data.id || `slide_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    this.slideNumber = data.slideNumber || 1;
    this.type = data.type || data.slideType || "bullets"; // title, executiveSummary, comparison, process, scorecard, cards, timeline, chart, table, quote, closing
    this.headline = data.headline || data.title || "";
    this.subtitle = data.subtitle || data.contentFocus || "";
    this.executiveSummary = data.executiveSummary || data.summary || "";
    this.keyInsight = data.keyInsight || data.mostImportantInsight || "";
    this.visualPriority = data.visualPriority || "standard"; // high, standard, secondary
    this.layoutScore = data.layoutScore || 85;
    this.layout = data.layout || "bullets";
    
    // Content Structures
    this.bullets = Array.isArray(data.bullets) ? data.bullets : [];
    this.cards = Array.isArray(data.cards) ? data.cards.map(c => ({
      title: c.title || c.label || "",
      value: c.value || "",
      subtitle: c.subtitle || c.description || "",
      description: c.description || c.comment || "",
      icon: c.icon || "star",
      trend: c.trend || null, // { direction: "up"|"down"|"flat", value: "+12%" }
      color: c.color || null,
    })) : Array.isArray(data.metrics) ? data.metrics.map(m => ({
      title: m.label || "",
      value: m.value || "",
      subtitle: "",
      description: "",
      icon: "bar-chart",
      trend: m.trend ? { direction: m.trend, value: "" } : null,
    })) : [];
    
    this.processSteps = Array.isArray(data.processSteps) ? data.processSteps.map(s => ({
      stepNumber: s.stepNumber || s.number || 1,
      title: s.title || "",
      description: s.description || "",
      icon: s.icon || "arrow",
    })) : Array.isArray(data.steps) ? data.steps.map((s, i) => ({
      stepNumber: s.number || i + 1,
      title: s.title || "",
      description: s.description || "",
      icon: s.icon || "arrow",
    })) : [];
    
    this.table = data.table ? {
      headers: Array.isArray(data.table.headers) ? data.table.headers : [],
      rows: Array.isArray(data.table.rows) ? data.table.rows : [],
    } : null;
    
    this.chart = data.chart ? {
      chartType: data.chart.chartType || data.chart.type || "bar", // bar, pie, donut, line, radar
      title: data.chart.title || "",
      categories: Array.isArray(data.chart.categories) ? data.chart.categories : Array.isArray(data.chart.labels) ? data.chart.labels : [],
      series: Array.isArray(data.chart.series) ? data.chart.series.map(s => ({
        name: s.name || "Series",
        values: Array.isArray(s.values) ? s.values : [],
      })) : Array.isArray(data.chart.values) ? [{ name: "Value", values: data.chart.values }] : [],
      unit: data.chart.unit || "",
    } : data.chartData ? {
      chartType: data.chartData.type || "bar",
      title: data.chartData.title || "",
      categories: Array.isArray(data.chartData.labels) ? data.chartData.labels : [],
      series: [{ name: "Value", values: Array.isArray(data.chartData.values) ? data.chartData.values : [] }],
      unit: "",
    } : null;
    
    this.quote = data.quote ? {
      text: typeof data.quote === "string" ? data.quote : data.quote.text || "",
      author: data.quote.author || data.quote.attribution || "",
      role: data.quote.role || "",
    } : null;
    
    this.images = Array.isArray(data.images) ? data.images : [];
    this.imageHints = Array.isArray(data.imageHints) ? data.imageHints : [];
    this.chartHints = Array.isArray(data.chartHints) ? data.chartHints : [];
    this.icons = Array.isArray(data.icons) ? data.icons : [];
    this.speakerNotes = data.speakerNotes || "";
    this.designOverrides = data.designOverrides || {};
    this.slideQualityScore = data.slideQualityScore || 90;
  }

  toJSON() {
    return { ...this };
  }
}

class PresentationModel {
  constructor(data = {}) {
    this.metadata = {
      title: data.metadata?.title || "Presentation",
      subtitle: data.metadata?.subtitle || "",
      author: data.metadata?.author || "AI Document Summarizer",
      company: data.metadata?.company || "Executive Report",
      subject: data.metadata?.subject || "Document Analysis",
      createdDate: data.metadata?.createdDate || new Date().toISOString(),
      version: data.metadata?.version || "2.0",
      documentType: data.metadata?.documentType || "general",
      documentHash: data.metadata?.documentHash || "",
    };
    
    this.context = {
      audience: data.context?.audience || "Executive Leadership",
      purpose: data.context?.purpose || "Inform & Present Key Findings",
      tone: data.context?.tone || "Professional",
      primaryLanguage: data.context?.primaryLanguage || "English",
      topQuantitativeFindings: Array.isArray(data.context?.topQuantitativeFindings) ? data.context.topQuantitativeFindings : [],
      keyMessages: Array.isArray(data.context?.keyMessages) ? data.context.keyMessages : [],
      narrativeArc: data.context?.narrativeArc || "",
    };

    this.theme = {
      name: data.theme?.name || "executive",
      palette: data.theme?.palette || null,
      assetPack: data.theme?.assetPack || data.theme?.name || "executive",
    };

    this.slides = Array.isArray(data.slides) ? data.slides.map((s, i) => new SlideModel({ ...s, slideNumber: i + 1 })) : [];
    
    this.qualityScore = data.qualityScore || {
      overall: 0,
      visualBalance: 0,
      typography: 0,
      charts: 0,
      whitespace: 0,
      consistency: 100,
      slideScores: [],
    };
  }

  addSlide(slideData) {
    const s = new SlideModel({ ...slideData, slideNumber: this.slides.length + 1 });
    this.slides.push(s);
    return s;
  }

  toJSON() {
    return {
      metadata: { ...this.metadata },
      context: { ...this.context },
      theme: { ...this.theme },
      slides: this.slides ? this.slides.map(s => (s.toJSON ? s.toJSON() : { ...s })) : [],
      qualityScore: { ...this.qualityScore },
    };
  }
}

module.exports = { PresentationModel, SlideModel };
