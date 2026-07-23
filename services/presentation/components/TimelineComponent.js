/**
 * TimelineComponent.js
 * Component for rendering chronological timelines, milestone nodes, date callouts,
 * and event detail cards.
 */

class TimelineComponent {
  static render(slide, rawTimeline, theme, startY, availH = 3.8) {
    const events = Array.isArray(rawTimeline) ? rawTimeline.slice(0, 6) : [];
    if (events.length === 0) return;

    const count = events.length;
    const spineY = startY + availH * 0.42;
    const totalW = 11.7;
    const itemW = totalW / count;

    // Horizontal Central Spine Line
    slide.addShape(slide.shapes.RECTANGLE, {
      x: 0.8,
      y: spineY,
      w: totalW,
      h: 0.05,
      fill: { color: theme.teal },
      line: { color: theme.teal },
    });

    const palette = [theme.teal, theme.accent, "0077B6", "E67E22", "8E44AD", "2ECC71"];

    events.forEach((evt, idx) => {
      const cx = 0.8 + idx * itemW + itemW * 0.5;
      const isAbove = idx % 2 === 0;
      const nodeColor = palette[idx % palette.length];

      // Outer Halo Circle
      slide.addShape(slide.shapes.OVAL, {
        x: cx - 0.22,
        y: spineY - 0.22,
        w: 0.44,
        h: 0.44,
        fill: { color: nodeColor, transparency: 75 },
        line: { color: nodeColor, transparency: 50 },
      });

      // Inner Core Node Circle
      slide.addShape(slide.shapes.OVAL, {
        x: cx - 0.12,
        y: spineY - 0.12,
        w: 0.24,
        h: 0.24,
        fill: { color: nodeColor },
        line: { color: nodeColor },
      });

      // Node Number
      slide.addText(String(idx + 1), {
        x: cx - 0.12,
        y: spineY - 0.12,
        w: 0.24,
        h: 0.24,
        fontSize: 9,
        bold: true,
        color: theme.textLight,
        align: "center",
        valign: "middle",
        fontFace: theme.fonts.body,
      });

      // Positioning Date & Event Card Above or Below Spine
      const dateText = String(evt.date || `Phase ${idx + 1}`).slice(0, 20);
      const eventText = String(evt.event || evt.title || "Milestone").slice(0, 35);
      const detailText = String(evt.detail || evt.description || "").slice(0, 65);

      if (isAbove) {
        // Date Badge
        slide.addText(dateText, {
          x: cx - itemW * 0.45,
          y: spineY - 0.75,
          w: itemW * 0.9,
          h: 0.26,
          fontSize: 9,
          bold: true,
          color: nodeColor,
          align: "center",
          fontFace: theme.fonts.body,
        });
        // Event Title
        slide.addText(eventText, {
          x: cx - itemW * 0.45,
          y: spineY - 0.46,
          w: itemW * 0.9,
          h: 0.35,
          fontSize: 10,
          bold: true,
          color: theme.textDark,
          align: "center",
          fontFace: theme.fonts.title,
        });
        // Detail Description
        if (detailText) {
          slide.addText(detailText, {
            x: cx - itemW * 0.45,
            y: startY,
            w: itemW * 0.9,
            h: spineY - startY - 0.8,
            fontSize: 8.5,
            color: theme.textMuted,
            align: "center",
            fontFace: theme.fonts.body,
            valign: "bottom",
          });
        }
      } else {
        // Below Spine
        slide.addText(dateText, {
          x: cx - itemW * 0.45,
          y: spineY + 0.28,
          w: itemW * 0.9,
          h: 0.26,
          fontSize: 9,
          bold: true,
          color: nodeColor,
          align: "center",
          fontFace: theme.fonts.body,
        });
        slide.addText(eventText, {
          x: cx - itemW * 0.45,
          y: spineY + 0.54,
          w: itemW * 0.9,
          h: 0.35,
          fontSize: 10,
          bold: true,
          color: theme.textDark,
          align: "center",
          fontFace: theme.fonts.title,
        });
        if (detailText) {
          slide.addText(detailText, {
            x: cx - itemW * 0.45,
            y: spineY + 0.92,
            w: itemW * 0.9,
            h: startY + availH - (spineY + 0.92),
            fontSize: 8.5,
            color: theme.textMuted,
            align: "center",
            fontFace: theme.fonts.body,
            valign: "top",
          });
        }
      }
    });
  }
}

module.exports = TimelineComponent;
