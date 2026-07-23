#!/usr/bin/env python3
"""
finalize_svg.py — Inlines SVGs and sanitizes XML structure prior to PPTX conversion.
"""

import sys
import os
import glob
import re

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

def sanitize_xml(content):
    if not content:
        return ""
    # Entity-aware regex: escape & only when not part of a valid XML entity
    return re.sub(r'&(?!amp;|lt;|gt;|quot;|apos;|#[0-9]+;|#x[0-9a-fA-F]+;)', '&amp;', content)

def process_svg_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Basic cleanup: remove markdown fences if present
    content = re.sub(r'^```xml\s*', '', content)
    content = re.sub(r'^```svg\s*', '', content)
    content = re.sub(r'\s*```$', '', content)

    # Sanitize XML entities
    content = sanitize_xml(content)

    # Remove incomplete trailing open tag at the end (e.g., `<text x="100" y=`)
    content = re.sub(r'<[a-zA-Z0-9_-]+(?:\s+[^>]*?)?$', '', content.strip())

    # Ensure xmlns, viewBox, width, and height exist on <svg> root tag
    if '<svg' in content and 'xmlns' not in content:
        content = re.sub(r'<svg\b', '<svg xmlns="http://www.w3.org/2000/svg"', content, count=1)

    if '<svg' in content and 'viewBox' not in content:
        content = re.sub(r'<svg\b', '<svg viewBox="0 0 1280 720" width="1280" height="720"', content, count=1)

    # Balance unclosed tags if present
    for tag in ["tspan", "text", "g", "defs", "linearGradient"]:
        open_c = len(re.findall(fr'<{tag}\b', content, re.IGNORECASE))
        close_c = len(re.findall(fr'</{tag}>', content, re.IGNORECASE))
        if open_c > close_c:
            content += f"</{tag}>" * (open_c - close_c)

    if not re.search(r'</svg>\s*$', content, re.IGNORECASE):
        content += "\n</svg>"

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
