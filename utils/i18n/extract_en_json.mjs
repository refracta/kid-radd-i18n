#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright-core';

function parseArgs(argv) {
  const options = {
    pagesDir: 'pages',
    outDir: 'i18n/lang/en/pages',
    start: null,
    end: null,
    comic: null,
    dryRun: false,
    chromiumPath:
      process.env.PLAYWRIGHT_CHROMIUM_PATH ||
      path.join(os.homedir(), '.cache/ms-playwright/chromium-1200/chrome-linux64/chrome'),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if ((arg === '--pages-dir' || arg === '--pagesDir') && next) {
      options.pagesDir = next;
      i += 1;
    } else if ((arg === '--out-dir' || arg === '--outDir') && next) {
      options.outDir = next;
      i += 1;
    } else if (arg === '--start' && next) {
      options.start = Number(next);
      i += 1;
    } else if (arg === '--end' && next) {
      options.end = Number(next);
      i += 1;
    } else if (arg === '--comic' && next) {
      options.comic = Number(next);
      i += 1;
    } else if (arg === '--dry-run' || arg === '--dryRun') {
      options.dryRun = true;
    } else if ((arg === '--chromium-path' || arg === '--chromiumPath') && next) {
      options.chromiumPath = next;
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(
    'Usage: node utils/i18n/extract_en_json.mjs [options]\n\n' +
      'Options:\n' +
      '  --pages-dir <dir>      Pages directory (default: pages)\n' +
      '  --out-dir <dir>        Output directory (default: i18n/lang/en/pages)\n' +
      '  --comic <n>            Extract one comic number (e.g. 2)\n' +
      '  --start <n>            Start comic number (inclusive)\n' +
      '  --end <n>              End comic number (inclusive)\n' +
      '  output format          html-only keys (e.g. panel.p1.bubble.center.html)\n' +
      '  --dry-run              Parse only, do not write files\n' +
      '  --chromium-path <path> Chromium executable path\n' +
      '  --help                 Show this help',
  );
}

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.htm': 'text/html; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function isPathWithin(rootDir, filePath) {
  const relative = path.relative(rootDir, filePath);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function resolveStaticPath(rootDir, pathname) {
  const normalizedPathname = pathname && pathname !== '/' ? pathname : '/index.htm';
  const candidatePath = path.resolve(rootDir, `.${normalizedPathname}`);
  if (!isPathWithin(rootDir, candidatePath)) {
    return null;
  }

  let stats;
  try {
    stats = await fs.stat(candidatePath);
  } catch {
    return null;
  }

  if (stats.isDirectory()) {
    const indexCandidates = ['index.htm', 'index.html'];
    for (const indexName of indexCandidates) {
      const indexPath = path.join(candidatePath, indexName);
      try {
        const indexStats = await fs.stat(indexPath);
        if (indexStats.isFile()) {
          return indexPath;
        }
      } catch {
        // ignore
      }
    }
    return null;
  }

  if (!stats.isFile()) {
    return null;
  }
  return candidatePath;
}

async function startStaticServer(rootDir) {
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(requestUrl.pathname);
      const filePath = await resolveStaticPath(rootDir, pathname);
      if (!filePath) {
        response.statusCode = 404;
        response.setHeader('Content-Type', 'text/plain; charset=utf-8');
        response.end('Not found');
        return;
      }

      const content = await fs.readFile(filePath);
      response.statusCode = 200;
      response.setHeader('Content-Type', getContentType(filePath));
      response.end(content);
    } catch (error) {
      response.statusCode = 500;
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      response.end(String(error && error.stack ? error.stack : error));
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address !== 'object') {
    throw new Error('Failed to bind local static server.');
  }

  return {
    server,
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}

async function discoverComics(rootDir, pagesDir) {
  const absPagesDir = path.resolve(rootDir, pagesDir);
  const entries = await fs.readdir(absPagesDir, { withFileTypes: true });
  const comics = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const match = /^comic(\d+)\.htm$/i.exec(entry.name);
    if (!match) {
      continue;
    }
    comics.push({
      number: Number(match[1]),
      pageFile: `comic${Number(match[1])}.htm`,
      sourcePath: path.join(absPagesDir, entry.name),
    });
  }

  comics.sort((a, b) => a.number - b.number);
  return comics;
}

function filterComics(comics, options) {
  return comics.filter((comic) => {
    if (Number.isFinite(options.comic) && comic.number !== options.comic) {
      return false;
    }
    if (Number.isFinite(options.start) && comic.number < options.start) {
      return false;
    }
    if (Number.isFinite(options.end) && comic.number > options.end) {
      return false;
    }
    return true;
  });
}

async function launchBrowser(chromiumPath) {
  let browser = null;
  let lastError = null;

  if (chromiumPath) {
    try {
      browser = await chromium.launch({
        executablePath: chromiumPath,
        headless: true,
      });
      return browser;
    } catch (error) {
      lastError = error;
    }
  }

  try {
    browser = await chromium.launch({ headless: true });
    return browser;
  } catch (error) {
    if (lastError) {
      const detail = `${lastError}\n\nFallback launch error:\n${error}`;
      throw new Error(detail);
    }
    throw error;
  }
}

async function extractComicStrings(page, comicPath) {
  await page.goto(comicPath, { waitUntil: 'domcontentloaded' });
  return page.evaluate(() => {
    const BUBBLE_SLOTS = ['left', 'center', 'right'];
    const MARKUP_RE = /<\s*\/?\s*[a-z][^>]*>/i;

    function normalizeText(value) {
      return String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function normalizeHtml(value) {
      return String(value || '').trim();
    }

    function readHtml(el) {
      if (!el) {
        return null;
      }
      const html = normalizeHtml(el.innerHTML || '');
      return html || null;
    }

    function escapeTextToHtml(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    function extractHtmlValue(el) {
      if (!el) {
        return null;
      }
      const html = readHtml(el);
      if (!html) {
        return null;
      }
      const text = normalizeText(el.textContent || '');
      if (!text) {
        return null;
      }
      if (hasMeaningfulMarkup(html)) {
        return html;
      }
      return escapeTextToHtml(text);
    }

    function hasMeaningfulMarkup(html) {
      if (!html) {
        return false;
      }
      return MARKUP_RE.test(html);
    }

    function getTitleMainTarget() {
      const title = document.querySelector('a[name="title"]');
      if (!title) {
        return null;
      }
      return (
        title.querySelector('font.rundschrift') ||
        title.querySelector('font[face*="VAG Rundschrift D"]') ||
        title.querySelector('font[face*="VAG Rundschrift"]')
      );
    }

    function getTitleExtraTargets() {
      const title = document.querySelector('a[name="title"]');
      if (!title) {
        return [];
      }

      const titleMainTarget = getTitleMainTarget();
      const allFonts = Array.from(title.querySelectorAll('font'));
      const targets = [];
      for (const node of allFonts) {
        const text = normalizeText((node.textContent || '').replace(/\u00a0/g, ' '));
        if (!text.length) {
          continue;
        }
        if (!/[A-Za-z0-9\u00C0-\u024F\uAC00-\uD7AF]/.test(text)) {
          continue;
        }
        if (titleMainTarget && containsOrSame(titleMainTarget, node)) {
          continue;
        }
        const parentFont = node.parentElement ? node.parentElement.closest('font') : null;
        if (parentFont) {
          const parentText = normalizeText((parentFont.textContent || '').replace(/\u00a0/g, ' '));
          if (parentText.length > 0) {
            continue;
          }
        }
        if (node.closest('a[href]')) {
          continue;
        }
        if (node.querySelector('a[href]')) {
          continue;
        }
        targets.push(node);
      }
      return targets;
    }

    function getComicPanelNames() {
      const names = [];
      const anchors = document.querySelectorAll('a[name]');
      anchors.forEach((anchor) => {
        const raw = (anchor.getAttribute('name') || '').toLowerCase();
        if (!/^p\d+$/.test(raw)) {
          return;
        }
        if (!names.includes(raw)) {
          names.push(raw);
        }
      });
      names.sort((left, right) => Number(left.slice(1)) - Number(right.slice(1)));
      return names;
    }

    function getPanel(panelName) {
      return document.querySelector(`a[name="${panelName}"]`);
    }

    function containsOrSame(parent, child) {
      if (!parent || !child) {
        return false;
      }
      return parent === child || parent.contains(child);
    }

    function isSameNodeOrEitherContains(left, right) {
      return containsOrSame(left, right) || containsOrSame(right, left);
    }

    function getNarrationTarget(panelName) {
      const panel = getPanel(panelName);
      if (!panel) {
        return null;
      }

      const yellowNarration = panel.querySelector('td[bgcolor="ffff99"] b');
      if (yellowNarration) {
        return yellowNarration;
      }

      const bubbleTable = findBubbleTable(panel);
      if (!bubbleTable) {
        return null;
      }

      const bubbleRow = bubbleTable.closest('tr');
      if (!bubbleRow) {
        return null;
      }

      let legacyRow = bubbleRow.previousElementSibling;
      while (legacyRow) {
        if (normalizeText(legacyRow.textContent || '').length > 0) {
          break;
        }
        legacyRow = legacyRow.previousElementSibling;
      }
      if (!legacyRow) {
        return null;
      }

      const legacyFonts = Array.from(legacyRow.querySelectorAll('font')).filter(
        (font) => normalizeText(font.textContent || '').length > 0,
      );
      if (legacyFonts.length === 1) {
        return legacyFonts[0];
      }
      if (legacyFonts.length > 1) {
        const sharedCenter = legacyFonts[0].closest('center');
        if (sharedCenter) {
          const allInSharedCenter = legacyFonts.every((font) => containsOrSame(sharedCenter, font));
          if (allInSharedCenter) {
            return sharedCenter;
          }
        }
      }

      const legacyBold = Array.from(legacyRow.querySelectorAll('b')).find(
        (node) => normalizeText(node.textContent || '').length > 0,
      );
      if (legacyBold) {
        return legacyBold;
      }

      const legacyCenter = Array.from(legacyRow.querySelectorAll('center')).find(
        (node) => normalizeText(node.textContent || '').length > 0,
      );
      if (legacyCenter) {
        return legacyCenter;
      }

      return (
        Array.from(legacyRow.querySelectorAll('font')).find(
          (node) => normalizeText(node.textContent || '').length > 0,
        ) || null
      );
    }

    function bubbleSlotToIndex(slotName) {
      const slot = String(slotName || 'center').toLowerCase();
      if (slot === 'left') {
        return 0;
      }
      if (slot === 'right') {
        return 2;
      }
      return 1;
    }

    function isBubbleTableCandidate(table) {
      if (!table) {
        return false;
      }
      if (table.querySelector('a')) {
        return false;
      }
      const firstRow = table.querySelector(':scope > tbody > tr') || table.querySelector('tr');
      if (!firstRow) {
        return false;
      }
      const cells = Array.from(firstRow.querySelectorAll(':scope > td'));
      if (cells.length !== 3) {
        return false;
      }
      const centerCellCount = cells.filter((cell) => cell.querySelector('center')).length;
      if (centerCellCount < 2) {
        return false;
      }
      return Boolean(table.querySelector('font[face*="arial"], font[face*="tahoma"]'));
    }

    function findBubbleTable(panel) {
      if (!panel) {
        return null;
      }
      const fixedWidthTable = panel.querySelector('table[width="250"]');
      if (fixedWidthTable) {
        return fixedWidthTable;
      }
      const tables = panel.querySelectorAll('table');
      for (const table of tables) {
        if (isBubbleTableCandidate(table)) {
          return table;
        }
      }
      return null;
    }

    function resolveBubbleTextTarget(cell) {
      if (!cell) {
        return null;
      }

      const centers = Array.from(cell.querySelectorAll('center'));
      if (centers.length) {
        const nonEmptyCenter = centers.find((center) => normalizeText(center.textContent || '').length > 0);
        if (nonEmptyCenter) {
          return nonEmptyCenter;
        }
      }

      const font = cell.querySelector('font');
      if (font) {
        return font;
      }

      if (centers.length) {
        return centers[0];
      }

      return cell;
    }

    function getBubbleTarget(panelName, slotName) {
      const panel = getPanel(panelName);
      const bubbleTable = findBubbleTable(panel);
      if (!bubbleTable) {
        return null;
      }

      let firstRow = bubbleTable.querySelector(':scope > tbody > tr');
      if (!firstRow) {
        firstRow = bubbleTable.querySelector('tr');
      }
      if (!firstRow) {
        return null;
      }

      const index = bubbleSlotToIndex(slotName);
      const cells = firstRow.querySelectorAll(':scope > td');
      const cell = cells[index];
      return resolveBubbleTextTarget(cell);
    }

    function getPanelChatTargets(panelName) {
      const panel = getPanel(panelName);
      if (!panel) {
        return [];
      }

      const bubbleTable = findBubbleTable(panel);
      if (!bubbleTable) {
        return [];
      }

      const bubbleRow = bubbleTable.closest('tr');
      if (!bubbleRow) {
        return [];
      }

      const targets = [];
      let row = bubbleRow.nextElementSibling;
      while (row) {
        const fonts = Array.from(row.querySelectorAll('font')).filter((font) => {
          const text = normalizeText(font.textContent || '');
          return text.length > 0 && text.includes(':');
        });
        targets.push(...fonts);
        row = row.nextElementSibling;
      }
      return targets;
    }

    function getPanelExtraTargets(panelName) {
      const panel = getPanel(panelName);
      if (!panel) {
        return [];
      }

      const narrationTarget = getNarrationTarget(panelName);
      const bubbleTable = findBubbleTable(panel);
      const chatTargets = getPanelChatTargets(panelName);
      const chatSet = new Set(chatTargets);
      const bubbleTextTargets = BUBBLE_SLOTS
        .map((slot) => getBubbleTarget(panelName, slot))
        .filter(Boolean);

      const allFonts = Array.from(panel.querySelectorAll('font'));
      const targets = [];
      for (const node of allFonts) {
        const rawText = (node.textContent || '').replace(/\u00a0/g, ' ');
        const text = normalizeText(rawText);
        if (!text.length) {
          continue;
        }
        if (isCopyrightFooterText(text)) {
          continue;
        }
        if (!/[A-Za-z0-9\u00C0-\u024F\uAC00-\uD7AF]/.test(text)) {
          continue;
        }
        if (narrationTarget && isSameNodeOrEitherContains(narrationTarget, node)) {
          continue;
        }
        let inBubbleText = false;
        for (const bubbleNode of bubbleTextTargets) {
          if (isSameNodeOrEitherContains(bubbleNode, node)) {
            inBubbleText = true;
            break;
          }
        }
        if (inBubbleText) {
          continue;
        }
        if (!bubbleTextTargets.length && bubbleTable && containsOrSame(bubbleTable, node)) {
          continue;
        }

        let inChat = false;
        for (const chatNode of chatSet) {
          if (isSameNodeOrEitherContains(chatNode, node)) {
            inChat = true;
            break;
          }
        }
        if (inChat) {
          continue;
        }
        // Exclude clickable links only; panel anchors like <a name="pX"> wrap valid text.
        if (node.closest('a[href]')) {
          continue;
        }
        if (node.querySelector('a[href]')) {
          continue;
        }
        targets.push(node);
      }
      return targets;
    }

    function isCopyrightFooterText(text) {
      const normalized = normalizeText(text);
      if (!normalized.length) {
        return false;
      }
      if (/kid radd\s*[©\u00a9]\s*\d{4}\s*by\s*dan miller/i.test(normalized)) {
        return true;
      }
      if (/[©\u00a9]\s*\d{4}.*sosumi corp/i.test(normalized)) {
        return true;
      }
      if (/[©\u00a9]\s*199x.*simian software/i.test(normalized)) {
        return true;
      }
      return false;
    }

    const strings = {};
    const titleTarget = getTitleMainTarget();
    const titleHtml = extractHtmlValue(titleTarget);
    if (titleHtml) {
      strings['title.main.html'] = titleHtml;
    }
    const titleExtraTargets = getTitleExtraTargets();
    for (let titleExtraIndex = 0; titleExtraIndex < titleExtraTargets.length; titleExtraIndex += 1) {
      const titleExtraHtml = extractHtmlValue(titleExtraTargets[titleExtraIndex]);
      if (!titleExtraHtml) {
        continue;
      }
      strings[`title.extra.${titleExtraIndex + 1}.html`] = titleExtraHtml;
    }

    const panels = getComicPanelNames();
    for (const panelName of panels) {
      const narrationTarget = getNarrationTarget(panelName);
      const narrationHtml = extractHtmlValue(narrationTarget);
      if (narrationHtml) {
        const narrationKey = `panel.${panelName}.narration.1.html`;
        strings[narrationKey] = narrationHtml;
      }

      for (const slot of BUBBLE_SLOTS) {
        const bubbleTarget = getBubbleTarget(panelName, slot);
        const bubbleHtml = extractHtmlValue(bubbleTarget);
        if (!bubbleHtml) {
          continue;
        }
        const bubbleKey = `panel.${panelName}.bubble.${slot}.html`;
        strings[bubbleKey] = bubbleHtml;
      }

      const chatTargets = getPanelChatTargets(panelName);
      for (let chatIndex = 0; chatIndex < chatTargets.length; chatIndex += 1) {
        const chatHtml = extractHtmlValue(chatTargets[chatIndex]);
        if (!chatHtml) {
          continue;
        }
        const chatKey = `panel.${panelName}.chat.${chatIndex + 1}.html`;
        strings[chatKey] = chatHtml;
      }

      const extraTargets = getPanelExtraTargets(panelName);
      for (let extraIndex = 0; extraIndex < extraTargets.length; extraIndex += 1) {
        const extraHtml = extractHtmlValue(extraTargets[extraIndex]);
        if (!extraHtml) {
          continue;
        }
        const extraKey = `panel.${panelName}.extra.${extraIndex + 1}.html`;
        strings[extraKey] = extraHtml;
      }
    }

    return strings;
  });
}

async function writeJsonFile(filePath, data) {
  const content = `${JSON.stringify(data, null, 2)}\n`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();

  if (
    (options.start !== null && Number.isNaN(options.start)) ||
    (options.end !== null && Number.isNaN(options.end)) ||
    (options.comic !== null && Number.isNaN(options.comic))
  ) {
    throw new Error('Invalid numeric value for --comic/--start/--end.');
  }

  const allComics = await discoverComics(rootDir, options.pagesDir);
  const comics = filterComics(allComics, options);
  if (comics.length === 0) {
    throw new Error('No matching comic pages found.');
  }

  const server = await startStaticServer(rootDir);
  const browser = await launchBrowser(options.chromiumPath);
  const page = await browser.newPage();

  let successCount = 0;
  const failures = [];

  try {
    for (const comic of comics) {
      const relativePagePath = `${options.pagesDir.replace(/\\/g, '/')}/${comic.pageFile}`;
      const pageUrl = `${server.origin}/${relativePagePath}`;
      try {
        const strings = await extractComicStrings(page, pageUrl);
        const data = {
          _meta: {
            page: `pages/${comic.pageFile}`,
            language: 'en',
            fallback: 'en',
          },
          strings,
        };

        const outFile = path.resolve(
          rootDir,
          options.outDir,
          comic.pageFile.replace(/\.htm$/i, '.json'),
        );
        if (!options.dryRun) {
          await writeJsonFile(outFile, data);
        }

        successCount += 1;
        const verb = options.dryRun ? 'parsed' : 'wrote';
        console.log(`${verb}: comic${comic.number} -> ${path.relative(rootDir, outFile)}`);
      } catch (error) {
        failures.push({
          comic: comic.number,
          error: error && error.message ? error.message : String(error),
        });
      }
    }
  } finally {
    await page.close();
    await browser.close();
    await server.close();
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`failed: comic${failure.comic} (${failure.error})`);
    }
    throw new Error(`Extraction completed with failures (${failures.length}/${comics.length}).`);
  }

  console.log(`done: ${successCount} comic(s).`);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
