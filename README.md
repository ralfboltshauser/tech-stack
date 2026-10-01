# Ralf’s Tech Stack

A fullscreen, pannable index of tools I think techies should know. Plain HTML, CSS and JavaScript; no runtime dependencies or account system.

## Preview

From this directory:

```sh
python3 -m http.server 8765
```

Open http://127.0.0.1:8765/. Drag or scroll to pan, pinch or Ctrl-scroll to zoom. Select a card for details, or use its arrow to visit the official website. Click the background or press Escape to clear the selection. Keyboard users can Tab through tools, or focus the canvas and use arrow keys, +, − and 0 (fit).

## Update the collection

Edit `ecosystem.json`, then regenerate the static directory and SEO files:

```sh
python3 scripts/build.py
node --check app.js
node tests/canvas-gestures.test.cjs
node tests/publication.test.cjs
```

- `territories` define the broad areas. `lane` positions the column; `columns` controls category columns within it. `exploration: true` places an area beyond the core map.
- `categories` belong to a territory and explain a job through a name and question.
- `tools` belong to a category. Keep IDs stable, add an HTTPS `url`, a local `icon` under `assets/`, and a short `purpose`. `example` and `distinction` explain where a tool fits.
- `scenarios` are retained data for future extensions, currently not displayed.

Array order controls reading order within each territory and category. The map loads the JSON directly. Rebuilding keeps the no-JavaScript directory and structured data in sync.

For local experiments, `window.builderAtlas` exposes `getData()`, `setData(data)`, `addTool(tool)`, `addCategory(category)`, `addTerritory(territory)`, `selectTool(id)` and `fit()`. Changes are in-memory only. There are no visitor-facing editing controls and no server-side writes.

## Deployment

Live site: https://tech.ralfboltshauser.com/

GitHub: https://github.com/ralfboltshauser/tech-stack

Vercel project: `tech-stack` in the `ralf-boltshauser-s-team` scope.

Vercel's GitHub integration deploys pushes to `main` to production and creates preview deployments for pull requests. Every deployment runs `npm run build`: regenerate the static directory and metadata, run the JavaScript and publication checks, then package the public files into `dist/`. A failed check fails the deployment.

```sh
npm ci
npm run build
```

This build requires Node.js 22 and Python 3. No runtime dependencies or deployment secrets are needed in GitHub Actions; Vercel handles the Git integration directly.

To change the public domain and regenerate sharing URLs:

```sh
python3 scripts/set-public-url.py https://your-domain/
```

Canonical links, absolute social-image URLs, the sitemap and collection structured data use `site.json`. The HTML includes the full collection for non-JavaScript readers and printing; the interactive map replaces it after successful loading. Fonts, icons and the social card are served locally.

The Git icon is the [Git logomark](https://git-scm.com/downloads/logos) by Jason Long, licensed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).

Only `dist/` is published. Build scripts, tests, README and concept studies stay out of the deployment. Configure a new domain in Vercel separately if you change `site.json`.

## Social previews

The page serves a 1200×630 Open Graph card first, a 1200×1200 square alternative, and a dedicated 1200×600 X/Twitter large card. All are opaque PNGs with absolute HTTPS URLs, image descriptions and versioned filenames. Platforms choose their own layout and may cache old previews; listing a square alternative does not force them to use it.

Artwork uses the site's local Geist fonts and real tool icons. To regenerate it with ImageMagick installed:

```sh
uv run --with pillow --with fonttools --with brotli python scripts/render-social.py
npm run build
```

The generated PNGs are committed, so deployment requires no image-rendering dependencies. Change filenames in `scripts/build.py` and the publication test when releasing a new artwork version.
