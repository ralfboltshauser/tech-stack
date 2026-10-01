#!/usr/bin/env python3
"""Regenerate the HTML directory, structured data, and deployment metadata."""
import html
import json
import re
from pathlib import Path
from urllib.parse import urljoin, urlsplit

ROOT = Path(__file__).resolve().parents[1]
esc = html.escape

def build():
    data = json.loads((ROOT / 'ecosystem.json').read_text())
    config = json.loads((ROOT / 'site.json').read_text())
    url = config['url'].rstrip('/') + '/'
    parts = urlsplit(url)
    if parts.scheme != 'https' or not parts.hostname or parts.username or parts.password or parts.query or parts.fragment:
        raise ValueError('Use a public HTTPS URL without credentials, query or fragment.')
    source = (ROOT / 'index.html').read_text()
    directory = ['<div id="directory" class="directory">', f'<h1>{esc(config["title"])}</h1>', f'<p>{esc(config["description"])}</p>']
    for territory in data['territories']:
        directory.append(f'<section><h2>{esc(territory["name"])}</h2>')
        for category in data['categories']:
            if category['territory'] != territory['id']:
                continue
            directory.append(f'<h3>{esc(category["name"])}</h3><ul>')
            for tool in data['tools']:
                if tool['category'] != category['id']:
                    continue
                name = esc(tool['name'])
                if tool.get('url'):
                    name = f'<a href="{esc(tool["url"], quote=True)}">{name}</a>'
                directory.append(f'<li>{name}<p>{esc(tool["purpose"])}</p></li>')
            directory.append('</ul>')
        directory.append('</section>')
    directory.append('</div>')
    source = re.sub(r'<!-- DIRECTORY:START -->.*?<!-- DIRECTORY:END -->', lambda _: '<!-- DIRECTORY:START -->\n'+'\n'.join(directory)+'\n<!-- DIRECTORY:END -->', source, flags=re.S)
    schema = {'@context': 'https://schema.org', '@type': 'CollectionPage', 'name': config['title'], 'description': config['description'], 'url': url, 'author': {'@type': 'Person', 'name': 'Ralf Boltshauser'}, 'mainEntity': {'@type': 'ItemList', 'numberOfItems': len(data['tools']), 'itemListElement': [{'@type': 'ListItem', 'position': i+1, 'item': {'@type': 'Thing', 'name': t['name'], 'description': t['purpose'], **({'url':t['url']} if t.get('url') else {})}} for i,t in enumerate(data['tools'])]}}
    source = re.sub(r'<!-- SEO:START -->.*?<!-- SEO:END -->\s*', '', source, flags=re.S)
    metadata = f'<!-- SEO:START -->\n<link rel="canonical" href="{esc(url, quote=True)}">\n<meta property="og:url" content="{esc(url, quote=True)}">\n<script type="application/ld+json">{json.dumps(schema, ensure_ascii=False).replace("<", chr(92)+"u003c")}</script>\n<!-- SEO:END -->\n'
    source = source.replace('</head>', metadata+'</head>')
    # Keep image metadata in server-rendered HTML; social crawlers need no JS.
    source = re.sub(r'<!-- SOCIAL:START -->.*?<!-- SOCIAL:END -->\s*', '', source, flags=re.S)
    source = re.sub(r'<meta\s+(?:property="og:image[^\"]*"|name="twitter:(?:image[^\"]*|card)")[^>]*>\s*', '', source)
    alt = f'{config["title"]} with a small map of Next.js, shadcn/ui, Vercel, Cloudflare, Codex and GitHub.'
    social = ['<!-- SOCIAL:START -->']
    for filename, width, height in [('social-card-v3.png', 1200, 630), ('social-card-square-v3.png', 1200, 1200)]:
        image_url = esc(urljoin(url, 'assets/' + filename), quote=True)
        for key, value in [('image', image_url), ('image:secure_url', image_url), ('image:type', 'image/png'), ('image:width', width), ('image:height', height), ('image:alt', esc(alt, quote=True))]:
            social.append(f'<meta property="og:{key}" content="{value}">')
    social.extend(['<meta name="twitter:card" content="summary_large_image">', f'<meta name="twitter:image" content="{esc(urljoin(url, "assets/social-card-x-v3.png"), quote=True)}">', f'<meta name="twitter:image:alt" content="{esc(alt, quote=True)}">', '<!-- SOCIAL:END -->'])
    source = source.replace('</head>', '\n'.join(social) + '\n</head>')
    (ROOT / 'index.html').write_text(source)
    (ROOT / 'robots.txt').write_text(f'User-agent: *\nAllow: /\n\nSitemap: {urljoin(url, "sitemap.xml")}\n')
    (ROOT / 'sitemap.xml').write_text(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>{esc(url)}</loc></url></urlset>\n')
    print(f'Built directory and metadata for {len(data["tools"])} entries at {url}')

if __name__ == '__main__':
    build()
