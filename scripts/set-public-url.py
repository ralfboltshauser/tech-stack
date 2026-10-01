#!/usr/bin/env python3
"""Set the public HTTPS URL and regenerate publication files."""
import json
import sys
from urllib.parse import urlsplit
from build import ROOT, build

if len(sys.argv) != 2:
    raise SystemExit('Usage: python3 scripts/set-public-url.py https://your-domain/')
url = sys.argv[1]
parts = urlsplit(url)
if parts.scheme != 'https' or not parts.hostname or parts.username or parts.password or parts.query or parts.fragment:
    raise SystemExit('Use the final HTTPS URL without credentials, query or fragment.')
config = json.loads((ROOT / 'site.json').read_text())
config['url'] = url.rstrip('/') + '/'
(ROOT / 'site.json').write_text(json.dumps(config, indent=2, ensure_ascii=False) + '\n')
build()
