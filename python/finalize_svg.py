#!/usr/bin/env python3
"""
finalize_svg.py — Inlines SVGs and sanitizes XML structure prior to PPTX conversion.
"""

import sys
import os
import glob
import re

def process_svg_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Basic cleanup: remove markdown fences if present
    content = re.sub(r'^```xml\s*', '', content)
    content = re.sub(r'^```svg\s*', '', content)
    content = re.sub(r'\s*```$', '', content)

    # Ensure viewBox and width/height exist
    if '<svg' in content and 'viewBox' not in content:
        content = content.replace('<svg', '<svg viewBox="0 0 1280 720" width="1280" height="720"')

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content.strip())

def main():
    if len(sys.argv) < 2:
        print("Usage: python finalize_svg.py <svg_dir>")
        sys.exit(1)

    svg_dir = sys.argv[1]
    svg_files = sorted(glob.glob(os.path.join(svg_dir, "*.svg")))
    print(f"Finalizing {len(svg_files)} SVG files in {svg_dir}...")

    for file_path in svg_files:
        try:
            process_svg_file(file_path)
        except Exception as e:
            print(f"Warning processing {file_path}: {e}")

    print("SVG finalization complete.")

if __name__ == "__main__":
    main()
