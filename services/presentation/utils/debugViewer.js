/**
 * debugViewer.js
 * Generates an HTML debug trace dashboard (debug/presentation.html) displaying pipeline outputs & quality scores.
 */

const fs = require("fs");
const path = require("path");

class DebugViewer {
  static generateDebugReport(taskId, presentationModel, stateData = {}) {
    const debugDir = path.join(__dirname, "../../../debug");
    const htmlFile = path.join(debugDir, `presentation_${taskId}.html`);

    try {
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }

      const slidesHtml = (presentationModel.slides || []).map((s, idx) => `
        <div style="border:1px solid #cbd5e1; border-radius:8px; padding:16px; margin-bottom:16px; background:#ffffff;">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">
            <h3 style="margin:0; color:#0f172a;">Slide ${idx + 1}: ${s.headline || s.type}</h3>
            <span style="background:#e0f2fe; color:#0369a1; padding:4px 8px; border-radius:4px; font-weight:bold; font-size:12px;">${s.layout}</span>
          </div>
          <p style="color:#475569; font-size:14px;"><strong>Subtitle:</strong> ${s.subtitle || 'N/A'}</p>
          <p style="color:#475569; font-size:14px;"><strong>Key Insight:</strong> ${s.keyInsight || 'N/A'}</p>
          ${s.bullets.length ? `<div><strong>Bullets:</strong> <ul>${s.bullets.map(b => `<li>${b}</li>`).join('')}</ul></div>` : ''}
          ${s.cards.length ? `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">${s.cards.map(c => `
            <div style="border:1px solid #e2e8f0; background:#f8fafc; padding:8px 12px; border-radius:6px; flex:1; min-width:140px;">
              <div style="font-weight:bold; font-size:16px; color:#0f172a;">${c.value}</div>
              <div style="font-size:12px; color:#64748b;">${c.title}</div>
            </div>
          `).join('')}</div>` : ''}
          ${s.chart ? `<div style="margin-top:8px; background:#f1f5f9; padding:8px; border-radius:6px;"><strong>Chart (${s.chart.chartType}):</strong> ${s.chart.title}</div>` : ''}
        </div>
      `).join('');

      const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Presentation Debug Trace — ${taskId}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; padding: 24px; color: #0f172a; }
          .card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 24px; }
          .metric-badge { font-size: 24px; font-weight: bold; color: #0284c7; }
        </style>
      </head>
      <body>
        <h1>📊 Presentation Pipeline Debug Dashboard</h1>
        <p><strong>Task ID:</strong> ${taskId} | <strong>Generated:</strong> ${new Date().toLocaleString()}</p>
        
        <div class="card" style="display:flex; gap:24px;">
          <div><div class="metric-badge">${presentationModel.qualityScore?.overall || 0}/100</div><div style="color:#64748b;">Overall Quality</div></div>
          <div><div class="metric-badge">${presentationModel.slides.length}</div><div style="color:#64748b;">Total Slides</div></div>
          <div><div class="metric-badge">${presentationModel.theme.name}</div><div style="color:#64748b;">Applied Theme</div></div>
        </div>

        <div class="card">
          <h2>Slide Breakdown</h2>
          ${slidesHtml}
        </div>
      </body>
      </html>
      `;

      fs.writeFileSync(htmlFile, html, "utf8");
      console.log(`📝 [DebugViewer] Generated visual trace report: ${htmlFile}`);
    } catch (err) {
      console.warn("⚠️ [DebugViewer] Failed to generate HTML report:", err.message);
    }
  }
}

module.exports = DebugViewer;
