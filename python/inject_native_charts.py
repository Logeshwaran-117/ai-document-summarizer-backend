#!/usr/bin/env python3
"""
inject_native_charts.py — Reads SVGs from a folder, finds data-pptx-replace-with markers,
and builds a PPTX with native charts/tables where markers exist, SVG shapes everywhere else.
"""

import sys
import json
import os
import re
from pathlib import Path
from xml.etree import ElementTree as ET

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE
from pptx.chart.data import ChartData

SLIDE_W = 13.333  # inches (16:9 presentation layout matching 1280px width)
SLIDE_H = 7.5     # inches (16:9 presentation layout matching 720px height)
PX_TO_IN = SLIDE_W / 1280  # 1px = 0.0104164 inches

def px_to_in(px):
    try:
        return float(px) * PX_TO_IN
    except Exception:
        return 0.0

def hex_to_rgb(hex_color):
    if not hex_color or not isinstance(hex_color, str):
        return RGBColor(15, 27, 56)
    hex_color = hex_color.lstrip("#")
    if len(hex_color) == 3:
        hex_color = "".join(c*2 for c in hex_color)
    if len(hex_color) < 6:
        return RGBColor(15, 27, 56)
    r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
    return RGBColor(r, g, b)

CHART_TYPE_MAP = {
    "bar": XL_CHART_TYPE.COLUMN_CLUSTERED,
    "column": XL_CHART_TYPE.COLUMN_CLUSTERED,
    "bar_horizontal": XL_CHART_TYPE.BAR_CLUSTERED,
    "line": XL_CHART_TYPE.LINE,
    "pie": XL_CHART_TYPE.PIE,
    "donut": XL_CHART_TYPE.DOUGHNUT,
    "doughnut": XL_CHART_TYPE.DOUGHNUT,
    "area": XL_CHART_TYPE.AREA,
    "scatter": XL_CHART_TYPE.XY_SCATTER,
}

def add_native_chart(slide, payload):
    chart_type_key = str(payload.get("chartType", "bar")).lower()
    chart_type = CHART_TYPE_MAP.get(chart_type_key, XL_CHART_TYPE.COLUMN_CLUSTERED)

    x = Inches(px_to_in(payload.get("x", 60)))
    y = Inches(px_to_in(payload.get("y", 150)))
    w = Inches(px_to_in(payload.get("width", 700)))
    h = Inches(px_to_in(payload.get("height", 400)))

    chart_data = ChartData()
    series_list = payload.get("series", [])

    if series_list:
        first_series = series_list[0]
        chart_data.categories = first_series.get("labels", [])
        for series in series_list:
            chart_data.add_series(
                series.get("name", "Series"),
                series.get("values", [])
            )

    chart = slide.shapes.add_chart(chart_type, x, y, w, h, chart_data).chart

    # Style the chart
    chart.has_legend = payload.get("showLegend", True)
    if chart.has_legend and hasattr(chart, 'legend') and chart.legend is not None:
        try:
            chart.legend.position = 2  # bottom
            chart.legend.include_in_layout = False
        except Exception:
            pass

    if len(chart.plots) > 0:
        plot = chart.plots[0]
        plot.has_data_labels = payload.get("showValues", False)

    # Apply colors if provided
    colors = payload.get("colors", [])
    for i, series in enumerate(chart.series):
        if i < len(colors):
            try:
                color = hex_to_rgb(colors[i])
                series.format.fill.solid()
                series.format.fill.fore_color.rgb = color
            except Exception:
                pass

def add_native_table(slide, payload):
    x = Inches(px_to_in(payload.get("x", 60)))
    y = Inches(px_to_in(payload.get("y", 150)))
    w = Inches(px_to_in(payload.get("width", 900)))
    h = Inches(px_to_in(payload.get("height", 400)))

    headers = payload.get("headers", [])
    rows = payload.get("rows", [])

    if not headers and not rows:
        return

    total_rows = len(rows) + (1 if headers else 0)
    cols = len(headers) if headers else (len(rows[0]) if rows else 1)

    table = slide.shapes.add_table(total_rows, cols, x, y, w, h).table

    header_fill = payload.get("headerFill", "0F1B38")
    header_text_color = payload.get("headerTextColor", "FFFFFF")
    row_fills = payload.get("rowFills", ["FFFFFF", "F0F4FA"])

    # Header row
    if headers:
        for j, header in enumerate(headers):
            cell = table.cell(0, j)
            cell.text = str(header)
            if cell.text_frame.paragraphs:
                tf = cell.text_frame.paragraphs[0]
                if tf.runs:
                    tf.runs[0].font.bold = True
                    tf.runs[0].font.size = Pt(payload.get("fontSize", 11))
                    try:
                        tf.runs[0].font.color.rgb = hex_to_rgb(header_text_color)
                    except Exception:
                        pass
            try:
                cell.fill.solid()
                cell.fill.fore_color.rgb = hex_to_rgb(header_fill)
            except Exception:
                pass

    # Data rows
    for i, row in enumerate(rows):
        row_idx = i + (1 if headers else 0)
        fill_color = row_fills[i % len(row_fills)] if row_fills else "FFFFFF"
        for j, cell_val in enumerate(row):
            if j >= cols:
                break
            cell = table.cell(row_idx, j)
            cell.text = str(cell_val)
            if cell.text_frame.paragraphs:
                tf = cell.text_frame.paragraphs[0]
                if tf.runs:
                    tf.runs[0].font.size = Pt(payload.get("fontSize", 10))
            try:
                cell.fill.solid()
                cell.fill.fore_color.rgb = hex_to_rgb(fill_color)
            except Exception:
                pass

def process_svg_file(svg_path, slide):
    """Parse one SVG, find native markers, add to slide."""
    try:
        ET.register_namespace("", "http://www.w3.org/2000/svg")
        tree = ET.parse(svg_path)
        root = tree.getroot()
    except Exception as e:
        print(f"  ⚠️ Error parsing XML in {svg_path}: {e}")
        return

    # Find all groups with data-pptx-replace-with
    for elem in root.iter():
        replace_with = elem.get("data-pptx-replace-with")
        if not replace_with:
            continue

        # Find the JSON metadata inside this group
        payload = None
        for child in elem:
            tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
            if tag == "metadata":
                try:
                    text = "".join(child.itertext()).strip()
                    payload = json.loads(text)
                    break
                except json.JSONDecodeError:
                    continue

        if payload is None:
            print(f"  ⚠️ Marker '{replace_with}' in {os.path.basename(svg_path)} has no valid JSON metadata, skipping")
            continue

        print(f"  ✅ Injecting native {replace_with}: {payload.get('title', 'untitled')}")

        if replace_with == "chart":
            add_native_chart(slide, payload)
        elif replace_with == "table":
            add_native_table(slide, payload)

def svg_folder_to_pptx(svg_dir, output_path):
    svg_dir = Path(svg_dir)
    svg_files = sorted(svg_dir.glob("*.svg"))

    if not svg_files:
        print(f"❌ No *.svg files found in {svg_dir}")
        sys.exit(1)

    print(f"📦 Processing {len(svg_files)} slides...")

    prs = Presentation()
    prs.slide_width = Inches(SLIDE_W)
    prs.slide_height = Inches(SLIDE_H)

    blank_layout = prs.slide_layouts[6]  # blank layout

    # Check for cairosvg
    cairosvg_available = False
    try:
        import cairosvg
        cairosvg_available = True
    except ImportError:
        cairosvg_available = False

    for i, svg_file in enumerate(svg_files):
        print(f"  🎨 Slide {i+1}: {svg_file.name}")
        slide = prs.slides.add_slide(blank_layout)

        # Convert SVG to PNG if cairosvg is available for exact visual background
        png_path = svg_file.with_suffix(".png")
        if cairosvg_available:
            try:
                cairosvg.svg2png(url=str(svg_file), write_to=str(png_path), output_width=1920, output_height=1080)
                pic = slide.shapes.add_picture(
                    str(png_path),
                    left=Inches(0), top=Inches(0),
                    width=Inches(SLIDE_W), height=Inches(SLIDE_H)
                )
                pic.name = f"svg_background_{i+1}"
                if os.path.exists(png_path):
                    os.remove(png_path)
            except Exception as e:
                print(f"  ⚠️ CairoSVG background rendering error: {e}")

        # Now inject native chart/table objects on top
        process_svg_file(svg_file, slide)

    prs.save(output_path)
    print(f"✅ Saved: {output_path}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python inject_native_charts.py <svg_dir> <output.pptx>")
        sys.exit(1)
    svg_folder_to_pptx(sys.argv[1], sys.argv[2])
