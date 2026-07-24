/**
 * SVGBuilder.js
 * Programmatic SVG XML string generator.
 * Converts layout trees directly into 100% syntactically valid SVG strings.
 */

class SVGBuilder {
  static buildSvgFromLayout(layoutTree) {
    const canvas = layoutTree.canvas || { width: 1280, height: 720, background: "#0F1B38" };
    const palette = layoutTree.theme || {};
    const isLight = palette.isLight !== false;

    let xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas.width} ${canvas.height}" width="${canvas.width}" height="${canvas.height}">\n`;
    xml += `  <rect width="${canvas.width}" height="${canvas.height}" fill="${canvas.background}"/>\n`;

    // Render architectural grid pattern mesh for institutional report aesthetic
    if (isLight) {
      xml += `  <!-- Institutional Mesh Grid Overlay -->\n`;
      const gridColor = palette.border || "#DDE4F5";
      for (let gx = 40; gx < 1280; gx += 40) {
        xml += `  <line x1="${gx}" y1="0" x2="${gx}" y2="720" stroke="${gridColor}" stroke-width="0.5" opacity="0.35"/>\n`;
      }
      for (let gy = 40; gy < 720; gy += 40) {
        xml += `  <line x1="0" y1="${gy}" x2="1280" y2="${gy}" stroke="${gridColor}" stroke-width="0.5" opacity="0.35"/>\n`;
      }
    }

    // Top-left accent chip
    xml += `  <rect x="60" y="40" width="36" height="36" fill="${palette.primary || '#0F1B38'}"/>\n`;

    // Top-right institutional metadata tag
    if (isLight) {
      xml += `  <text x="1220" y="55" font-family="Calibri" font-size="10" font-weight="bold" fill="${palette.textMuted || '#4A5A7A'}" text-anchor="end" letter-spacing="1.5">SURVEILLANCE REPORT | EXECUTIVE SUMMARY / 2026</text>\n`;
    }

    const nodes = layoutTree.nodes || [];
    for (const node of nodes) {
      xml += this.renderNode(node);
    }

    xml += `</svg>`;
    return xml;
  }

  static renderNode(node) {
    switch (node.type) {
      case "rect": {
        const rx = node.rx ? ` rx="${node.rx}" ry="${node.ry || node.rx}"` : "";
        const stroke = node.stroke ? ` stroke="${node.stroke}" stroke-width="${node.strokeWidth || 1}"` : "";
        return `  <rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" fill="${node.fill}"${stroke}${rx}/>\n`;
      }

      case "line": {
        const sw = node.strokeWidth || 1;
        return `  <line x1="${node.x1}" y1="${node.y1}" x2="${node.x2}" y2="${node.y2}" stroke="${node.stroke}" stroke-width="${sw}"/>\n`;
      }

      case "circle": {
        const stroke = node.stroke ? ` stroke="${node.stroke}" stroke-width="${node.strokeWidth || 1}"` : "";
        return `  <circle cx="${node.cx}" cy="${node.cy}" r="${node.r}" fill="${node.fill}"${stroke}/>\n`;
      }

      case "path": {
        const fill = node.fill ? ` fill="${node.fill}"` : ' fill="none"';
        const stroke = node.stroke ? ` stroke="${node.stroke}" stroke-width="${node.strokeWidth || 1}"` : "";
        return `  <path d="${node.d}"${fill}${stroke}/>\n`;
      }

      case "polygon": {
        const fill = node.fill ? ` fill="${node.fill}"` : ' fill="none"';
        const stroke = node.stroke ? ` stroke="${node.stroke}" stroke-width="${node.strokeWidth || 1}"` : "";
        const opacity = node.opacity !== undefined ? ` opacity="${node.opacity}"` : "";
        return `  <polygon points="${node.points}"${fill}${stroke}${opacity}/>\n`;
      }

      case "text": {
        const anchor = node.textAnchor ? ` text-anchor="${node.textAnchor}"` : "";
        const weight = node.fontWeight ? ` font-weight="${node.fontWeight}"` : "";
        const family = node.fontFace || "Calibri";
        const maxW = node.maxWidth || node.width || 1160;
        return `  <text x="${node.x}" y="${node.y}" data-max-width="${maxW}" font-family="${family}" font-size="${node.fontSize}" fill="${node.fill}"${weight}${anchor}>${this.escapeXml(node.text)}</text>\n`;
      }

      case "textBlock": {
        const lines = node.lines || [];
        if (lines.length === 0) return "";

        const anchor = node.textAnchor ? ` text-anchor="${node.textAnchor}"` : "";
        const weight = node.fontWeight ? ` font-weight="${node.fontWeight}"` : "";
        const family = node.fontFace || "Calibri";
        const startY = node.y;
        const dy = node.lineHeight || Math.round(node.fontSize * 1.25);
        const maxW = node.maxWidth || node.width || 1160;

        let tspans = "";
        lines.forEach((line, i) => {
          const lineY = startY + i * dy;
          tspans += `\n    <tspan x="${node.x}" y="${lineY}">${this.escapeXml(line)}</tspan>`;
        });

        return `  <text data-max-width="${maxW}" font-family="${family}" font-size="${node.fontSize}" fill="${node.fill}"${weight}${anchor}>${tspans}\n  </text>\n`;
      }

      default:
        return "";
    }
  }

  static escapeXml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }
}

module.SVGBuilder = SVGBuilder;
module.exports = SVGBuilder;
