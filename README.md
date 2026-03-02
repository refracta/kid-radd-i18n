# kid-radd-i18n

English/Korean localization and rendering pipeline for the **Kid Radd** webcomic archive.

## Project URL

- GitHub Pages: https://refracta.github.io/kid-radd-i18n/

## Overview

This repository keeps the original comic pages/assets and adds:

- Runtime language switching (`en`, `ko`)
- Per-page translation JSON files
- Extraction/normalization tools for i18n data
- Automated rendering to WebP
- GitHub Actions packaging + rolling release publishing

The site remains static HTML. Localization is applied at runtime by `i18n/web/i18n.js`.

## Repository Layout

- `pages/`: Original comic HTML pages (`comic1.htm` ... `comic601.htm`)
- `assets/`: Original web assets + loader script (`radd.js`)
- `i18n/web/`: Runtime i18n engine
- `i18n/lang/en/pages/`, `i18n/lang/ko/pages/`: Page-level localization JSON
- `i18n/languages.json`: Supported languages, labels, and font/UI profiles
- `i18n/chapters.json`: Chapter ranges metadata
- `utils/i18n/`: Extraction/normalization/CSV translation helpers
- `utils/capture/export_comic_panels_webp.mjs`: Panel renderer (Playwright + ffmpeg)
- `.github/workflows/render-comics-release.yml`: Render/package/release workflow
- `scripts/release.sh`: Rolling release helper for GitHub Releases

## Requirements

- Node.js 20+
- npm
- `ffmpeg` (required for WebP export)
- Chromium for Playwright

Install:

```bash
npm install
node node_modules/playwright-core/cli.js install chromium
```

## Local Preview

Use a local HTTP server (recommended over opening files directly):

```bash
python -m http.server 8080
```

Then open:

- `http://127.0.0.1:8080/index.htm`

## Translation Data Format

Each page JSON follows this shape:

```json
{
  "_meta": {
    "page": "pages/comic119.htm",
    "language": "ko",
    "fallback": "en"
  },
  "strings": {
    "title.main.html": "\"SAMURAI\"",
    "panel.p1.narration.1.html": "...",
    "panel.p1.bubble.left.html": "...",
    "panel.p1.chat.1.html": "...",
    "panel.p1.extra.1.html": "..."
  }
}
```

This project uses `html` keys as the canonical format (`*.html`).

## Tooling

### 1) Extract English Source Strings

```bash
node utils/i18n/extract_en_json.mjs --start 1 --end 601
```

Single page:

```bash
node utils/i18n/extract_en_json.mjs --comic 119
```

Dry run:

```bash
node utils/i18n/extract_en_json.mjs --comic 119 --dry-run
```

### 2) Normalize JSON to HTML-Only Keys

```bash
node utils/i18n/normalize_html_only_json.mjs --dir i18n/lang/en/pages --dir i18n/lang/ko/pages
```

### 3) Chapter CSV Translation Workflow

Build CSV:

```bash
python utils/i18n/build_chapter_translation_csv.py --help
```

Apply CSV:

```bash
python utils/i18n/apply_chapter_translation_csv.py --help
```

### 4) Render WebP Panels

Example (`ko`, comics 1-30):

```bash
node utils/capture/export_comic_panels_webp.mjs \
  --start 1 \
  --end 30 \
  --browser-locale ko \
  --output-dir exports/panels-webp-ko-1-30
```

## CI/CD: Render + Release

Workflow: `.github/workflows/render-comics-release.yml`

- Triggers on:
  - `push` to `main`
  - manual `workflow_dispatch`
- Renders `en` + `ko` in shards (`1..601`)
- Uploads shard artifacts
- Flattens file names to:
  - `comic001.p0.webp`
  - `comic120.p3.webp`
- Builds one zip:
  - `kid-radd-images-i18n.zip` (contains both `en/` and `ko/`)
- Publishes a rolling GitHub Release via `scripts/release.sh`

Manual release helper usage:

```bash
bash scripts/release.sh --help
```

## Notes

- The runtime i18n loader is injected by `assets/radd.js`.
- Korean title font profile uses `i18n/fonts/tmoney.css`.
- For reproducible rendering in CI, use Ubuntu + Playwright Chromium + ffmpeg.
