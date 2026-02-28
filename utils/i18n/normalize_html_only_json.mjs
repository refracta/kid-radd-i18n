#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const options = {
    dirs: ['i18n/lang/ko/pages', 'i18n/lang/en/pages'],
    dryRun: false,
  };

  let hasCustomDir = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if ((arg === '--dir' || arg === '--dirs') && next) {
      if (!hasCustomDir) {
        options.dirs = [];
        hasCustomDir = true;
      }
      options.dirs.push(next);
      i += 1;
    } else if (arg === '--dry-run' || arg === '--dryRun') {
      options.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(
    'Usage: node utils/i18n/normalize_html_only_json.mjs [options]\n\n' +
      'Options:\n' +
      '  --dir <path>     Target directory (repeatable)\n' +
      '  --dry-run        Show changes without writing\n' +
      '  --help           Show this help',
  );
}

async function listJsonFilesRecursive(rootDir) {
  const files = [];

  async function walk(dir) {
    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (entry.isFile() && /\.json$/i.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  files.sort();
  return files;
}

function escapeTextToHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function normalizeReadableHtml(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/gi, "'");
}

function normalizeStringsToHtmlOnly(strings) {
  const input = strings || {};
  const normalized = {};
  const keys = Object.keys(input);

  for (const key of keys) {
    const value = input[key];
    if (typeof value !== 'string') {
      continue;
    }

    if (/\.html$/i.test(key)) {
      normalized[key] = normalizeReadableHtml(value);
      continue;
    }

    const htmlKey = `${key}.html`;
    if (typeof input[htmlKey] === 'string') {
      if (typeof normalized[htmlKey] !== 'string') {
        normalized[htmlKey] = normalizeReadableHtml(input[htmlKey]);
      }
      continue;
    }

    normalized[htmlKey] = escapeTextToHtml(value);
  }

  return normalized;
}

async function normalizeFile(filePath, dryRun) {
  const raw = await fs.readFile(filePath, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${filePath}: invalid JSON (${error.message})`);
  }

  if (!data || typeof data !== 'object' || !data.strings || typeof data.strings !== 'object') {
    return { changed: false };
  }

  const nextStrings = normalizeStringsToHtmlOnly(data.strings);
  const nextData = {
    ...data,
    strings: nextStrings,
  };

  const nextRaw = `${JSON.stringify(nextData, null, 2)}\n`;
  if (nextRaw === raw) {
    return { changed: false };
  }

  if (!dryRun) {
    await fs.writeFile(filePath, nextRaw, 'utf8');
  }
  return { changed: true };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const dirs = options.dirs.map((dir) => path.resolve(root, dir));

  const jsonFiles = [];
  for (const dir of dirs) {
    const files = await listJsonFilesRecursive(dir);
    jsonFiles.push(...files);
  }

  let changedCount = 0;
  for (const filePath of jsonFiles) {
    const result = await normalizeFile(filePath, options.dryRun);
    if (!result.changed) {
      continue;
    }
    changedCount += 1;
    const rel = path.relative(root, filePath);
    console.log(`${options.dryRun ? 'would-update' : 'updated'}: ${rel}`);
  }

  console.log(
    `${options.dryRun ? 'dry-run' : 'done'}: files=${jsonFiles.length}, changed=${changedCount}`,
  );
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
