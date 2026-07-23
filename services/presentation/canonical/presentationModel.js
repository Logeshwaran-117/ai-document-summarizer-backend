/**
 * presentationModel.js
 * Canonical schema for Presentation & Slide data objects.
 */

class SlideModel {
  constructor(data = {}) {
    this.id = data.id || `slide_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    this.slideNumber = data.slideNumber || 1;
    this.type = data.type || "content"; // title, executiveSummary, comparison, process, scorecard, cards, timeline, chart, table, quote, closing
    this.headline = data.headline || "";
    this.subtitle = data.subtitle || "";
    this.summary = data.summary || "";
    this.keyInsight = data.keyInsight || "";
    this.layout = data.layout || "content";
    
    // Content Structures
    this.bullets = Array.isArray(data.bullets) ? data.bullets : [];
    this.cards = Array.isArray(data.cards) ? data.cards.map(c => ({
      title: c.title || "",
      value: c.value || "",
      subtitle: c.subtitle || "",
      description: c.description || "",
      icon: c.icon || "star",
      trend: c.trend || null, // { direction: "up"|"down"|"flat", value: "+12%" }
      color: c.color || null,
    })) : [];
    
    this.processSteps = Array.isArray(data.processSteps) ? data.processSteps.map(s => ({
      stepNumber: s.stepNumber || 1,
      title: s.title || "",
      description: s.description || "",
      icon: s.icon || "arrow",
    })) : [];
    
    this.table = data.table ? {
      headers: Array.isArray(data.table.headers) ? data.table.headers : [],
      rows: Array.isArray(data.table.rows) ? data.table.rows : [],
    } : null;
    
    this.chart = data.chart ? {
      chartType: data.chart.chartType || "bar", // bar, pie, donut, line
      title: data.chart.title || "",
      categories: Array.isArray(data.chart.categories) ? data.chart.categories : [],
      series: Array.isArray(data.chart.series) ? data.chart.series.map(s => ({
        name: s.name || "Series",
        values: Array.isArray(s.values) ? s.values : [],
      })) : [],
      unit: data.chart.unit || "",
    } : null;
    
    this.quote = data.quote ? {
      text: data.quote.text || "",
      author: data.quote.author || "",
      role: data.quote.role || "",
    } : null;
    
    this.images = Array.isArray(data.images) ? data.images : [];
    this.icons = Array.isArray(data.icons) ? data.icons : [];
    this.speakerNotes = data.speakerNotes || "";
    this.designOverrides = data.designOverrides || {};
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
      version: data.metadata?.version || "1.0",
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
      assetPack: data.theme?.assetPack || "executive",
    };

    this.slides = Array.isArray(data.slides) ? data.slides.map((s, i) => new SlideModel({ ...s, slideNumber: i + 1 })) : [];
    
    this.qualityScore = data.qualityScore || {
      overall: 0,
      visualBalance: 0,
      typography: 0,
      charts: 0,
      whitespace: 0,
      consistency: 0,
    };
  }

  addSlide(slideData) {
    const s = new SlideModel({ ...slideData, slideNumber: this.slides.length + 1 });
    this.slides.push(s);
    return s;
  }

  toJSON() {
    return JSON.parse(JSON.stringify(this));
  }
}

module.exports = { PresentationModel, SlideModel };
