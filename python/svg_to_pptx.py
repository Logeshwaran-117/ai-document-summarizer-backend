#!/usr/bin/env python3
"""
svg_to_pptx.py — Converts a directory of SVG slide files into a PowerPoint presentation (.pptx).
Handles SVG elements (rectangles, text, circles, lines) and embeds vector slide images into PPTX.
"""

import sys
import os
import argparse
import glob
# pyrefly: ignore [missing-import]
try:
    from pptx import Presentation
    from pptx.util import Inches, Pt
    from pptx.dml.color import RGBColor
    from pptx.enum.text import PP_ALIGN
except ModuleNotFoundError:
    import subprocess
    print("⚠️ python-pptx missing in Python environment. Auto-installing required packages...")
    pkgs = ["python-pptx>=0.6.23", "lxml>=4.9", "Pillow>=10.0"]
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "--break-system-packages"] + pkgs)
    except Exception:
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install"] + pkgs)
        except Exception as _inst_err:
            print(f"❌ Failed to auto-install python-pptx: {_inst_err}", file=sys.stderr)
            raise

    from pptx import Presentation
    from pptx.util import Inches, Pt
    from pptx.dml.color import RGBColor
    from pptx.enum.text import PP_ALIGN
    print("✅ python-pptx auto-installed successfully.")

try:
    # pyrefly: ignore [missing-import]
    import cairosvg
    CAIRO_AVAILABLE = True
except Exception:
    CAIRO_AVAILABLE = False

from inject_native_charts import svg_folder_to_pptx

def convert_svg_folder_to_pptx(svg_dir, output_path):
    svg_folder_to_pptx(svg_dir, output_path)

def main():
    parser = argparse.ArgumentParser(description="Convert directory of SVG files to PPTX.")
    parser.add_argument("svg_dir", help="Directory containing slide SVG files")
    parser.add_argument("--output", "-o", required=True, help="Output PPTX file path")
    args = parser.parse_args()

    try:
        convert_svg_folder_to_pptx(args.svg_dir, args.output)
    except Exception as e:
        print(f"Error converting SVG to PPTX: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
