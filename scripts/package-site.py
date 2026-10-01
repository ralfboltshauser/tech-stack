#!/usr/bin/env python3
"""Assemble only the public site files for static hosting."""
import shutil
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist'
if OUT.exists():
    shutil.rmtree(OUT)
OUT.mkdir()
for name in ['index.html', 'app.js', 'style.css', 'ecosystem.json', 'favicon.svg', 'favicon.ico', 'site.webmanifest', 'robots.txt', 'sitemap.xml']:
    shutil.copy2(ROOT / name, OUT / name)
shutil.copytree(ROOT / 'assets', OUT / 'assets', ignore=shutil.ignore_patterns('*concept*', '*.md', '.DS_Store'))
print('Static site packaged in dist/')
