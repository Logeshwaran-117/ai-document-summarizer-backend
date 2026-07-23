/**
 * Quote.js
 * Component for rendering executive quote callouts, quotation mark watermarks,
 * body text formatting, and author/role attribution blocks.
 */

class QuoteComponent {
  static render(slide, rawQuote, theme, startY, availH = 3.8) {
    if (!rawQuote) return;

    const quoteText = typeof rawQuote === "string" ? rawQuote : rawQuote.text || rawQuote.body || "";
    const attribution = typeof rawQuote === "object" ? rawQuote.author || rawQuote.attribution || rawQuote.role || "" : "";

    if (!quoteText) return;

    const containerW = 11.7;
    const cardH = Math.min(availH, 3.2);

    // Card Container
    slide.addShape("roundRect", {
      x: 0.8,
      y: startY,
      w: containerW,
      h: cardH,
      rectRadius: 0.06,
      fill: { color: theme.cardAlt },
      line: { color: theme.border, width: 1 },
    });

    // Decorative Oversized Quotation Mark Watermark
    slide.addText("“", {
      x: 1.0,
      y: startY - 0.1,
      w: 1.2,
      h: 1.2,
      fontSize: 90,
      bold: true,
      color: theme.accent,
      fontFace: theme.fonts.title,
      transparency: 65,
    });

    // Quote Body Text
    slide.addText(`"${String(quoteText).slice(0, 320)}"`, {
      x: 2.0,
      y: startY + 0.3,
      w: 10.0,
      h: cardH - 1.0,
      fontSize: quoteText.length > 200 ? 15 : 18,
      italic: true,
      color: theme.textDark,
      fontFace: theme.fonts.title,
      valign: "middle",
      lineSpacing: 28,
    });

    // Attribution / Author Tag
    if (attribution) {
      slide.addText(`— ${String(attribution).slice(0, 60)}`, {
        x: 2.0,
        y: startY + cardH - 0.6,
        w: 10.0,
        h: 0.4,
        fontSize: 12,
        bold: true,
        color: theme.teal,
        fontFace: theme.fonts.body,
        align: "right",
      });
    }
  }
}

module.exports = QuoteComponent;
