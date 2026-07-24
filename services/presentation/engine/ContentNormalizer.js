/**
 * ContentNormalizer.js
 * Strict content cleaning and normalization before layout computation.
 * Sanitizes markdown artifacts, normalizes text strings, strips raw CSV noise, and caps item list lengths.
 */

class ContentNormalizer {
  /**
   * Sanitizes a text string by stripping markdown symbols, raw CSV commas, and PDF instructions.
   */
  static cleanText(str) {
    if (!str || typeof str !== "string") return "";
    let res = str
      .replace(/[*_#`~]+/g, "") // Remove bold, italic, header, code formatting
      .replace(/^[\s•\-\*]+/, "") // Remove leading bullet chars
      .replace(/\(to be filled as in CIF[^\)]*\)/gi, "") // Remove PDF CIF instructions
      .replace(/\(\d+-character alphanumeric[^\)]*\)/gi, "") // Remove PDF field instructions
      .replace(/\(DD\/MM\/YYYY\)/gi, "") // Remove format tags
      .replace(/Strategic analysis generated from primary financial[^\.]*\./gi, "") // Remove stale financial boilerplate
      .replace(/Key operational risk indicators, cash flow[^\.]*\./gi, "")
      .replace(/Actionable recommendations prioritized based on debt[^\.]*\./gi, "")
      .replace(/^["'\s,;:-]+/, "") // Strip leading quotes/commas
      .replace(/["'\s,;:-]+$/, "") // Strip trailing quotes/commas
      .replace(/[,;]{2,}/g, " ") // Collapse multiple commas/semicolons
      .replace(/\s+/g, " ") // Normalize multiple spaces
      .trim();

    // If string is a raw CSV record (e.g. TN-VLR-26-001,7.01.2026,Latheri PHC,Latheri,Nila,F...), convert to human summary
    if (res.includes(",") && res.split(",").length >= 4 && /TN-VLR|PHC|UPHC|DOB/i.test(res)) {
      const parts = res.split(",").map(p => p.trim()).filter(Boolean);
      res = parts.slice(0, 4).join(" — ");
    }

    return res;
  }

  /**
   * Normalizes an entire slide content object before layout planning.
   */
  static normalizeSlideContent(slide) {
    if (!slide || typeof slide !== "object") {
      return { slideNumber: 1, slideType: "executiveSummary", title: "Executive Overview", bullets: [] };
    }

    const cleanedSlide = { ...slide };

    // Clean Slide Title & Subtitle
    cleanedSlide.title = this.cleanText(slide.title) || "Executive Briefing";
    cleanedSlide.subtitle = this.cleanText(slide.subtitle || slide.contentFocus || "");

    // Normalize Bullets
    if (Array.isArray(slide.bullets)) {
      cleanedSlide.bullets = slide.bullets
        .map(b => this.cleanText(b))
        .filter(b => b.length > 0)
        .slice(0, 6); // Cap at 6 bullets per slide
    } else {
      cleanedSlide.bullets = [];
    }

    // Normalize Metrics
    if (Array.isArray(slide.metrics)) {
      cleanedSlide.metrics = slide.metrics
        .map(m => ({
          label: this.cleanText(m.label || m.name || "METRIC"),
          value: this.cleanText(m.value || m.val || "0%"),
          detail: this.cleanText(m.detail || m.description || ""),
        }))
        .filter(m => m.label.length > 0 || m.value.length > 0)
        .slice(0, 4); // Cap at 4 metrics
    } else {
      cleanedSlide.metrics = [];
    }

    // Normalize Cards
    if (Array.isArray(slide.cards)) {
      cleanedSlide.cards = slide.cards
        .map(c => ({
          title: this.cleanText(c.title || "Key Action"),
          value: this.cleanText(c.value || ""),
          detail: this.cleanText(c.detail || c.description || ""),
          bullets: Array.isArray(c.bullets) ? c.bullets.map(b => this.cleanText(b)).slice(0, 3) : [],
        }))
        .slice(0, 4); // Cap at 4 cards
    } else {
      cleanedSlide.cards = [];
    }

    // Normalize Steps
    if (Array.isArray(slide.steps)) {
      cleanedSlide.steps = slide.steps
        .map((s, idx) => ({
          stepNumber: String(s.stepNumber || idx + 1).padStart(2, "0"),
          title: this.cleanText(s.title || `Step ${idx + 1}`),
          description: this.cleanText(s.description || s.detail || ""),
        }))
        .slice(0, 4);
    } else {
      cleanedSlide.steps = [];
    }

    // Normalize Quadrants (SWOT)
    if (slide.quadrants && typeof slide.quadrants === "object") {
      const q = slide.quadrants;
      cleanedSlide.quadrants = {
        strengths: (Array.isArray(q.strengths) ? q.strengths : []).map(b => this.cleanText(b)).filter(Boolean).slice(0, 3),
        weaknesses: (Array.isArray(q.weaknesses) ? q.weaknesses : []).map(b => this.cleanText(b)).filter(Boolean).slice(0, 3),
        opportunities: (Array.isArray(q.opportunities) ? q.opportunities : []).map(b => this.cleanText(b)).filter(Boolean).slice(0, 3),
        threats: (Array.isArray(q.threats) ? q.threats : []).map(b => this.cleanText(b)).filter(Boolean).slice(0, 3),
      };
    }

    // Normalize Chart Data
    if (slide.chart && typeof slide.chart === "object") {
      const categories = (Array.isArray(slide.chart.categories) ? slide.chart.categories : ["Category 1", "Category 2", "Category 3"])
        .map(c => this.cleanText(c))
        .filter(Boolean)
        .slice(0, 5);

      const series = Array.isArray(slide.chart.series) && slide.chart.series.length > 0
        ? slide.chart.series.map(s => ({
            name: this.cleanText(s.name || "Actual"),
            values: Array.isArray(s.values) ? s.values.map(v => parseFloat(v) || 0).slice(0, categories.length) : [50, 60, 70],
          }))
        : [{ name: "Actual", values: [80, 65, 90, 75] }];

      cleanedSlide.chart = { categories: categories.length > 0 ? categories : ["Category 1", "Category 2", "Category 3"], series };
    }

    // Normalize Table Data
    if (slide.table && typeof slide.table === "object") {
      const headers = (Array.isArray(slide.table.headers) ? slide.table.headers : ["Indicator / Sector", "Target Volume", "Coverage Rate", "Status & Remarks"])
        .map(h => this.cleanText(h))
        .filter(Boolean)
        .slice(0, 5);

      const rows = (Array.isArray(slide.table.rows) ? slide.table.rows : [])
        .map(r => (Array.isArray(r) ? r.map(cell => this.cleanText(cell)) : [this.cleanText(r)]).slice(0, headers.length))
        .filter(r => r.length > 0 && r.some(cell => cell.length > 0))
        .slice(0, 8);

      cleanedSlide.table = { headers: headers.length > 0 ? headers : ["Indicator / Sector", "Target Volume", "Coverage Rate", "Status & Remarks"], rows };
    }

    return cleanedSlide;
  }

  /**
   * Evaluates array of slide objects and splits oversized slides across multiple paginated sub-slides.
   */
  static paginatePresentationSlides(slides) {
    if (!Array.isArray(slides)) return [];
    const paginated = [];

    slides.forEach(slide => {
      // Check metrics pagination (>4 items)
      if (Array.isArray(slide.metrics) && slide.metrics.length > 4) {
        const total = slide.metrics.length;
        const chunkSize = 3;
        const pageCount = Math.ceil(total / chunkSize);

        for (let p = 0; p < pageCount; p++) {
          const chunk = slide.metrics.slice(p * chunkSize, (p + 1) * chunkSize);
          paginated.push({
            ...slide,
            title: `${slide.title || "Key Metrics"} (${p + 1}/${pageCount})`,
            metrics: chunk,
          });
        }
        return;
      }

      // Check cards pagination (>4 items)
      if (Array.isArray(slide.cards) && slide.cards.length > 4) {
        const total = slide.cards.length;
        const chunkSize = 3;
        const pageCount = Math.ceil(total / chunkSize);

        for (let p = 0; p < pageCount; p++) {
          const chunk = slide.cards.slice(p * chunkSize, (p + 1) * chunkSize);
          paginated.push({
            ...slide,
            title: `${slide.title || "Key Items"} (${p + 1}/${pageCount})`,
            cards: chunk,
          });
        }
        return;
      }

      // Check steps pagination (>4 items)
      if (Array.isArray(slide.steps) && slide.steps.length > 4) {
        const total = slide.steps.length;
        const chunkSize = 3;
        const pageCount = Math.ceil(total / chunkSize);

        for (let p = 0; p < pageCount; p++) {
          const chunk = slide.steps.slice(p * chunkSize, (p + 1) * chunkSize);
          paginated.push({
            ...slide,
            title: `${slide.title || "Process Workflow"} (${p + 1}/${pageCount})`,
            steps: chunk,
          });
        }
        return;
      }

      paginated.push(slide);
    });

    // Re-index slide numbers sequentially
    return paginated.map((s, idx) => ({ ...s, slideNumber: idx + 1 }));
  }
}

module.exports = ContentNormalizer;
