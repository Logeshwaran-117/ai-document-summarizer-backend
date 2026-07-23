/**
 * Table.js
 * Component for rendering structured presentation tables with styled header rows,
 * zebra-striped body rows, column width auto-calculation, and totals.
 */

class TableComponent {
  static render(slide, tableData, theme, startY, availH = 3.8) {
    if (!tableData || (!tableData.headers && !tableData.rows)) return;

    const rawHeaders = Array.isArray(tableData.headers) ? tableData.headers : [];
    const rawRows = Array.isArray(tableData.rows) ? tableData.rows : [];

    if (rawHeaders.length === 0 && rawRows.length === 0) return;

    const numCols = Math.max(
      rawHeaders.length,
      ...rawRows.map(r => (Array.isArray(r) ? r.length : Object.keys(r).length))
    );
    if (numCols === 0) return;

    // Build normalized rows
    const headers = rawHeaders.length > 0
      ? rawHeaders.map(h => String(h).slice(0, 30))
      : Array.from({ length: numCols }, (_, i) => `Col ${i + 1}`);

    const maxBodyRows = Math.min(rawRows.length, 8);
    const bodyRows = rawRows.slice(0, maxBodyRows).map(row => {
      if (Array.isArray(row)) {
        return row.slice(0, numCols).map(cell => String(cell || "").slice(0, 45));
      }
      if (typeof row === "object" && row !== null) {
        return Object.values(row).slice(0, numCols).map(cell => String(cell || "").slice(0, 45));
      }
      return [String(row)];
    });

    // Formatting rules
    const totalTableW = 11.7;
    const colW = totalTableW / numCols;
    const totalRowsCount = bodyRows.length + 1;
    const rowH = Math.min(Math.max((availH - 0.2) / totalRowsCount, 0.35), 0.55);

    const pptxRows = [];

    // Header Row
    const headerCells = headers.map(h => ({
      text: String(h).toUpperCase(),
      options: {
        fill: { color: theme.bgDark },
        color: theme.textLight,
        fontFace: theme.fonts.body,
        fontSize: 10,
        bold: true,
        align: "center",
        valign: "middle",
      },
    }));
    pptxRows.push(headerCells);

    // Body Rows (Zebra striped)
    bodyRows.forEach((row, rIdx) => {
      const bg = rIdx % 2 === 0 ? theme.cardBg : theme.cardAlt;
      const rowCells = row.map(cellText => ({
        text: cellText,
        options: {
          fill: { color: bg },
          color: theme.textDark,
          fontFace: theme.fonts.body,
          fontSize: 9.5,
          align: "left",
          valign: "middle",
        },
      }));
      pptxRows.push(rowCells);
    });

    // Render Table in Slide
    slide.addTable(pptxRows, {
      x: 0.8,
      y: startY,
      w: totalTableW,
      colW: Array(numCols).fill(colW),
      rowH: Array(pptxRows.length).fill(rowH),
      border: { pt: 0.5, color: theme.border },
    });
  }
}

module.exports = TableComponent;
