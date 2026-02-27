#!/usr/bin/env node

import { promises as fs, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';

function parseArgs(argv) {
  const options = {
    pagesDir: 'pages',
    outputDir: 'exports/panels-webp',
    start: null,
    end: null,
    maxComics: null,
    frameCount: 24,
    frameDelayMs: 120,
    minCycleFrames: 2,
    captureZoom: 2.5,
    deviceScaleFactor: 1,
    gifOversample: 4,
    timingScale: 1,
    settleHoldMs: 400,
    maxPanelCaptureMs: 10000,
    forceLoopEnable: true,
    renderFullWebp: false,
    browserLocale: 'ko',
    lossless: true,
    quality: 75,
    timeoutMs: 15000,
    chromiumPath:
      process.env.PLAYWRIGHT_CHROMIUM_PATH ||
      path.join(os.homedir(), '.cache/ms-playwright/chromium-1200/chrome-linux64/chrome'),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--pages-dir' && next) {
      options.pagesDir = next;
      i += 1;
    } else if (arg === '--output-dir' && next) {
      options.outputDir = next;
      i += 1;
    } else if (arg === '--start' && next) {
      options.start = Number(next);
      i += 1;
    } else if (arg === '--end' && next) {
      options.end = Number(next);
      i += 1;
    } else if (arg === '--max-comics' && next) {
      options.maxComics = Number(next);
      i += 1;
    } else if (arg === '--frame-count' && next) {
      options.frameCount = Number(next);
      i += 1;
    } else if (arg === '--frame-delay-ms' && next) {
      options.frameDelayMs = Number(next);
      i += 1;
    } else if (arg === '--min-cycle-frames' && next) {
      options.minCycleFrames = Number(next);
      i += 1;
    } else if (arg === '--capture-zoom' && next) {
      options.captureZoom = Number(next);
      i += 1;
    } else if (arg === '--device-scale-factor' && next) {
      options.deviceScaleFactor = Number(next);
      i += 1;
    } else if (arg === '--gif-oversample' && next) {
      options.gifOversample = Number(next);
      i += 1;
    } else if (arg === '--timing-scale' && next) {
      options.timingScale = Number(next);
      i += 1;
    } else if (arg === '--settle-hold-ms' && next) {
      options.settleHoldMs = Number(next);
      i += 1;
    } else if (arg === '--max-panel-capture-ms' && next) {
      options.maxPanelCaptureMs = Number(next);
      i += 1;
    } else if (arg === '--force-loop-enable' || arg === '--force_loop_enable') {
      options.forceLoopEnable = true;
    } else if (arg === '--no-force-loop-enable') {
      options.forceLoopEnable = false;
    } else if (arg === '--render-full-webp') {
      options.renderFullWebp = true;
    } else if (arg === '--browser-locale' && next) {
      options.browserLocale = next;
      i += 1;
    } else if (arg === '--lossless') {
      options.lossless = true;
    } else if (arg === '--lossy') {
      options.lossless = false;
    } else if (arg === '--quality' && next) {
      options.quality = Number(next);
      i += 1;
    } else if (arg === '--timeout-ms' && next) {
      options.timeoutMs = Number(next);
      i += 1;
    } else if (arg === '--chromium-path' && next) {
      options.chromiumPath = next;
      i += 1;
    } else if (arg === '--help') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node utils/capture/export_comic_panels_webp.mjs [options]\n\n` +
    `Options:\n` +
    `  --pages-dir <dir>        Pages directory (default: pages)\n` +
    `  --output-dir <dir>       Output directory (default: exports/panels-webp)\n` +
    `  --start <n>              Start comic number (e.g. 1)\n` +
    `  --end <n>                End comic number\n` +
    `  --max-comics <n>         Limit number of comics\n` +
    `  --frame-count <n>        Max sampled frames per panel (default: 24)\n` +
    `  --frame-delay-ms <n>     Delay between frames (default: 120ms)\n` +
    `  --min-cycle-frames <n>   Minimum loop length to detect (default: 2)\n` +
    `  --capture-zoom <n>       CSS zoom during capture (default: 2.5)\n` +
    `  --device-scale-factor <n> Device pixel ratio for capture (default: 1)\n` +
    `  --gif-oversample <n>     Sampling multiplier for GIF timing (default: 4)\n` +
    `  --timing-scale <n>       Playback duration multiplier (default: 1)\n` +
    `  --settle-hold-ms <n>     Extra capture tail for one-shot GIFs (default: 400)\n` +
    `  --max-panel-capture-ms <n> Max capture duration per panel (default: 10000)\n` +
    `  --force_loop_enable      Always save animated WebP as infinite loop (default)\n` +
    `  --no-force-loop-enable   Disable forced infinite loop (allow one-shot)\n` +
    `  --render-full-webp       Also render stacked full.webp (title,p1..pn)\n` +
    `  --browser-locale <tag>   Browser locale (default: ko)\n` +
    `  --lossless               Use lossless WebP encoding (default)\n` +
    `  --lossy                  Use lossy WebP encoding\n` +
    `  --quality <0-100>        Lossy quality (default: 75)\n` +
    `  --timeout-ms <n>         Navigation timeout (default: 15000ms)\n` +
    `  --chromium-path <path>   Chromium executable path\n` +
    `  --help                   Show this help\n`);
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
    const dirIndexCandidates = ['index.htm', 'index.html'];
    for (const indexName of dirIndexCandidates) {
      const indexPath = path.join(candidatePath, indexName);
      try {
        const indexStats = await fs.stat(indexPath);
        if (indexStats.isFile()) {
          return indexPath;
        }
      } catch {
        // ignore and continue lookup
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
      response.end(`Server error: ${String(error.message || error)}`);
    }
  });

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(0, '127.0.0.1');
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to determine static server address');
  }

  return {
    server,
    rootDir,
    origin: `http://127.0.0.1:${address.port}`,
  };
}

async function stopStaticServer(server) {
  if (!server) {
    return;
  }
  await new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function filePathToHttpUrl(filePath, serveRoot, origin) {
  const relative = path.relative(serveRoot, filePath);
  if (relative === '' || relative === '.') {
    return `${origin}/`;
  }
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  const encodedPath = relative
    .split(path.sep)
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `${origin}/${encodedPath}`;
}

async function waitForI18nLanguage(page, targetLocale, timeoutMs) {
  const waitMs = Math.max(300, Number.isFinite(timeoutMs) ? timeoutMs : 2000);
  return page.evaluate(async ({ locale, maxWaitMs }) => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const normalize = (value) => {
      if (!value || typeof value !== 'string') {
        return null;
      }
      const out = value.trim().toLowerCase().replace(/_/g, '-');
      return out || null;
    };
    const resolveSupported = (value, supported) => {
      const normalized = normalize(value);
      if (!normalized || !Array.isArray(supported)) {
        return null;
      }
      for (const raw of supported) {
        if (normalize(raw) === normalized) {
          return raw;
        }
      }
      const base = normalized.split('-')[0];
      for (const raw of supported) {
        const normalizedRaw = normalize(raw);
        if (normalizedRaw && normalizedRaw.split('-')[0] === base) {
          return raw;
        }
      }
      return null;
    };

    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      if (window.KidRaddI18n && typeof window.KidRaddI18n.getLanguage === 'function') {
        break;
      }
      await sleep(40);
    }

    const api = window.KidRaddI18n;
    if (!api || typeof api.getLanguage !== 'function') {
      return {
        available: false,
        desired: null,
        resolved: null,
        htmlLang: document.documentElement ? document.documentElement.lang || null : null,
        timedOut: true,
      };
    }

    let desired = null;
    try {
      const config = typeof api.getConfig === 'function' ? api.getConfig() : null;
      const supported = config && Array.isArray(config.supported) ? config.supported : [];
      desired = resolveSupported(locale, supported) || normalize(locale);
      if (desired && typeof api.setLanguage === 'function') {
        api.setLanguage(desired);
      }
    } catch {
      // no-op
    }

    while (Date.now() < deadline) {
      let current = null;
      try {
        current = api.getLanguage();
      } catch {
        current = null;
      }

      const normalizedCurrent = normalize(current);
      const normalizedDesired = normalize(desired);
      if (normalizedCurrent && (!normalizedDesired || normalizedCurrent === normalizedDesired)) {
        return {
          available: true,
          desired: desired || null,
          resolved: current || null,
          htmlLang: document.documentElement ? document.documentElement.lang || null : null,
          timedOut: false,
        };
      }
      await sleep(40);
    }

    let fallbackCurrent = null;
    try {
      fallbackCurrent = api.getLanguage();
    } catch {
      fallbackCurrent = null;
    }
    return {
      available: true,
      desired: desired || null,
      resolved: fallbackCurrent || null,
      htmlLang: document.documentElement ? document.documentElement.lang || null : null,
      timedOut: true,
    };
  }, { locale: targetLocale, maxWaitMs: waitMs });
}

async function listComicFiles(pagesDir, start, end, maxComics) {
  const entries = await fs.readdir(pagesDir, { withFileTypes: true });

  let comics = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .map((name) => {
      const match = /^comic(\d+)\.htm$/i.exec(name);
      return match ? { name, number: Number(match[1]) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.number - b.number);

  if (Number.isFinite(start)) {
    comics = comics.filter((comic) => comic.number >= start);
  }
  if (Number.isFinite(end)) {
    comics = comics.filter((comic) => comic.number <= end);
  }
  if (Number.isFinite(maxComics)) {
    comics = comics.slice(0, maxComics);
  }

  return comics;
}

function bufferHash(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex');
}

function patchWebpAnimLoopCount(filePath, loopCount) {
  const bytes = readFileSync(filePath);
  if (bytes.length < 16) return;
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') {
    return;
  }

  let pos = 12;
  while (pos + 8 <= bytes.length) {
    const tag = bytes.toString('ascii', pos, pos + 4);
    const chunkSize = bytes.readUInt32LE(pos + 4);
    const chunkData = pos + 8;
    if (tag === 'ANIM' && chunkSize >= 6 && chunkData + 6 <= bytes.length) {
      bytes[chunkData + 4] = loopCount & 0xff;
      bytes[chunkData + 5] = (loopCount >> 8) & 0xff;
      writeFileSync(filePath, bytes);
      return;
    }
    pos = chunkData + chunkSize + (chunkSize % 2);
  }
}

function skipGifSubBlocks(bytes, start) {
  let pos = start;
  while (pos < bytes.length) {
    const blockSize = bytes[pos];
    pos += 1;
    if (blockSize === 0) {
      return pos;
    }
    pos += blockSize;
    if (pos > bytes.length) {
      return bytes.length;
    }
  }
  return pos;
}

function extractGifInfo(filePath) {
  const bytes = readFileSync(filePath);
  if (bytes.length < 13) return null;

  const signature = bytes.toString('ascii', 0, 6);
  if (signature !== 'GIF87a' && signature !== 'GIF89a') {
    return null;
  }

  let pos = 6;
  const lsdPacked = bytes[pos + 4];
  pos += 7;

  if (lsdPacked & 0x80) {
    const gctEntries = 1 << ((lsdPacked & 0x07) + 1);
    pos += 3 * gctEntries;
  }

  if (pos > bytes.length) return null;

  let minDelayMs = null;
  let frameCount = 0;
  let totalDurationMs = 0;
  let loopCount = null;
  const delaysMs = [];
  while (pos < bytes.length) {
    const blockId = bytes[pos];
    pos += 1;

    if (blockId === 0x3B) {
      break;
    }

    if (blockId === 0x21) {
      if (pos >= bytes.length) break;
      const extensionLabel = bytes[pos];
      pos += 1;

      if (extensionLabel === 0xF9) {
        if (pos >= bytes.length) break;
        const blockSize = bytes[pos];
        pos += 1;
        if (blockSize !== 4 || pos + blockSize > bytes.length) {
          pos += blockSize;
          if (pos < bytes.length && bytes[pos] === 0) pos += 1;
          continue;
        }

        const delayCs = bytes[pos + 1] | (bytes[pos + 2] << 8);
        let delayMs = delayCs * 10;
        // Browsers typically clamp ultra-low/zero GIF delays; use 10ms floor.
        if (delayMs < 10) delayMs = 10;

        minDelayMs = minDelayMs === null ? delayMs : Math.min(minDelayMs, delayMs);
        frameCount += 1;
        totalDurationMs += delayMs;
        delaysMs.push(delayMs);

        pos += blockSize;
        if (pos < bytes.length && bytes[pos] === 0) {
          pos += 1;
        }
        continue;
      }

      if (extensionLabel === 0xFF) {
        if (pos >= bytes.length) break;
        const appBlockSize = bytes[pos];
        pos += 1;
        if (pos + appBlockSize > bytes.length) break;
        const appId = bytes.toString('ascii', pos, pos + appBlockSize);
        pos += appBlockSize;

        if (appId === 'NETSCAPE2.0' || appId === 'ANIMEXTS1.0') {
          if (pos >= bytes.length) break;
          const subSize = bytes[pos];
          pos += 1;
          if (subSize === 3 && pos + subSize <= bytes.length && bytes[pos] === 1) {
            loopCount = bytes[pos + 1] | (bytes[pos + 2] << 8);
          }
          pos += subSize;
          if (pos < bytes.length && bytes[pos] === 0) {
            pos += 1;
          }
          continue;
        }

        pos = skipGifSubBlocks(bytes, pos);
        continue;
      }

      if (pos >= bytes.length) break;
      const extensionBlockSize = bytes[pos];
      pos += 1 + extensionBlockSize;
      if (pos > bytes.length) break;
      pos = skipGifSubBlocks(bytes, pos);
      continue;
    }

    if (blockId === 0x2C) {
      if (pos + 9 > bytes.length) break;
      const imagePacked = bytes[pos + 8];
      pos += 9;

      if (imagePacked & 0x80) {
        const lctEntries = 1 << ((imagePacked & 0x07) + 1);
        pos += 3 * lctEntries;
      }
      if (pos >= bytes.length) break;

      // LZW minimum code size.
      pos += 1;
      pos = skipGifSubBlocks(bytes, pos);
      continue;
    }

    break;
  }

  return {
    minDelayMs,
    frameCount,
    totalDurationMs: frameCount > 0 ? totalDurationMs : null,
    loopCount,
    delaysMs,
  };
}

function getPanelGifTiming(gifUrls) {
  let parsedGifCount = 0;
  let minDelayMs = null;
  let hasInfiniteLoop = false;
  let hasFiniteOrUnknownLoop = false;
  let expectedDurationMs = null;
  let primaryDelayProfile = null;
  let primaryDurationMs = -1;

  for (const gifUrl of gifUrls) {
    if (!gifUrl || !gifUrl.startsWith('file://')) {
      continue;
    }

    try {
      const gifPath = fileURLToPath(gifUrl);
      const gifInfo = extractGifInfo(gifPath);
      if (gifInfo && Number.isFinite(gifInfo.minDelayMs)) {
        parsedGifCount += 1;
        minDelayMs = minDelayMs === null
          ? gifInfo.minDelayMs
          : Math.min(minDelayMs, gifInfo.minDelayMs);

        if (gifInfo.loopCount === 0) {
          hasInfiniteLoop = true;
        } else {
          hasFiniteOrUnknownLoop = true;
          if (Number.isFinite(gifInfo.totalDurationMs)) {
            const repeat = gifInfo.loopCount === null ? 1 : Math.max(1, gifInfo.loopCount);
            const duration = gifInfo.totalDurationMs * repeat;
            expectedDurationMs = expectedDurationMs === null
              ? duration
              : Math.max(expectedDurationMs, duration);
          }
        }

        if (
          Array.isArray(gifInfo.delaysMs) &&
          gifInfo.delaysMs.length > 0 &&
          Number.isFinite(gifInfo.totalDurationMs) &&
          gifInfo.totalDurationMs > primaryDurationMs
        ) {
          primaryDurationMs = gifInfo.totalDurationMs;
          primaryDelayProfile = gifInfo.delaysMs.slice();
        }
      }
    } catch (_error) {
      // Ignore malformed/unreadable GIF sources and keep fallback delay.
    }
  }

  return {
    parsedGifCount,
    minDelayMs,
    hasInfiniteLoop,
    hasFiniteOrUnknownLoop,
    oneShotLikely: hasFiniteOrUnknownLoop && !hasInfiniteLoop,
    expectedDurationMs,
    primaryDelayProfile,
  };
}

function runFfmpeg(args) {
  const result = spawnSync('ffmpeg', args, { stdio: 'pipe', encoding: 'utf8' });
  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    throw new Error(`ffmpeg failed (${result.status}): ${stderr}`);
  }
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function removeDir(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true });
}

function detectCycleLength(hashes, minCycleFrames) {
  const total = hashes.length;
  const maxCycle = Math.floor(total / 2);
  if (maxCycle < minCycleFrames) return null;

  for (let cycle = minCycleFrames; cycle <= maxCycle; cycle += 1) {
    let matches = 0;
    let comparisons = 0;

    for (let i = cycle; i < total; i += 1) {
      comparisons += 1;
      if (hashes[i] === hashes[i - cycle]) {
        matches += 1;
      }
    }

    if (comparisons === 0) continue;
    const matchRatio = matches / comparisons;
    if (matchRatio >= 0.98) {
      return cycle;
    }
  }

  return null;
}

function collapseFrameRuns(frameInfos, fallbackDurationMs) {
  const runs = [];

  for (const frame of frameInfos) {
    const last = runs[runs.length - 1];
    const durationMs = Number.isFinite(frame.durationMs) ? frame.durationMs : fallbackDurationMs;
    if (last && last.hash === frame.hash) {
      last.durationMs += durationMs;
    } else {
      runs.push({
        path: frame.path,
        hash: frame.hash,
        durationMs,
      });
    }
  }

  if (runs.length > 1 && runs[0].hash === runs[runs.length - 1].hash) {
    runs[0].durationMs += runs[runs.length - 1].durationMs;
    runs.pop();
  }

  return runs;
}

function mergeBoundaryRun(runs) {
  if (runs.length > 1 && runs[0].hash === runs[runs.length - 1].hash) {
    runs[0].durationMs += runs[runs.length - 1].durationMs;
    runs.pop();
  }
  return runs;
}

function quantizeRunDurations(runs, targetDelayMs) {
  if (!Number.isFinite(targetDelayMs) || targetDelayMs <= 0) {
    return runs;
  }

  return runs.map((run) => {
    const units = Math.max(1, Math.round(run.durationMs / targetDelayMs));
    return {
      ...run,
      durationMs: units * targetDelayMs,
    };
  });
}

function scaleRunDurations(runs, timingScale) {
  if (!Number.isFinite(timingScale) || timingScale <= 0 || timingScale === 1) {
    return runs;
  }
  return runs.map((run) => ({
    ...run,
    durationMs: Math.max(10, Math.round(run.durationMs * timingScale)),
  }));
}

function sumRunDurations(runs) {
  return runs.reduce((acc, run) => acc + (Number.isFinite(run.durationMs) ? run.durationMs : 0), 0);
}

function remapRunDurationsToProfile(runs, delayProfile) {
  if (!Array.isArray(delayProfile) || delayProfile.length === 0 || runs.length === 0) {
    return runs;
  }

  const n = delayProfile.length;
  const m = runs.length;
  return runs.map((run, idx) => {
    const start = Math.floor((idx * n) / m);
    const end = Math.floor(((idx + 1) * n) / m);
    let mapped = 0;
    for (let i = start; i < end; i += 1) {
      mapped += delayProfile[i];
    }
    if (mapped <= 0) {
      mapped = Math.max(10, Math.round(sumRunDurations(runs) / m));
    }
    return {
      ...run,
      durationMs: mapped,
    };
  });
}

function buildAveragedCycleRuns(sampleRuns, cycleStart, cycleLength, sampleDelayMs) {
  if (!cycleLength || cycleLength <= 0) return null;
  const tail = sampleRuns.slice(cycleStart);
  if (tail.length < cycleLength) return null;

  const buckets = Array.from({ length: cycleLength }, () => ({
    path: null,
    hash: null,
    totalDurationMs: 0,
    count: 0,
  }));

  for (let i = 0; i < tail.length; i += 1) {
    const phase = i % cycleLength;
    const run = tail[i];
    const bucket = buckets[phase];
    if (!bucket.path) {
      bucket.path = run.path;
      bucket.hash = run.hash;
    }
    bucket.totalDurationMs += run.durationMs;
    bucket.count += 1;
  }

  return buckets
    .filter((bucket) => bucket.path && bucket.hash)
    .map((bucket) => {
      const avgDuration = bucket.totalDurationMs / Math.max(1, bucket.count);
      const units = Math.max(1, Math.round(avgDuration / sampleDelayMs));
      return {
        path: bucket.path,
        hash: bucket.hash,
        durationMs: units * sampleDelayMs,
      };
    });
}

async function writeConcatFile(concatPath, runs) {
  const lines = ['ffconcat version 1.0'];

  for (const run of runs) {
    const normalizedPath = run.path.replace(/\\/g, '/').replace(/'/g, "'\\''");
    lines.push(`file '${normalizedPath}'`);
    lines.push(`duration ${(run.durationMs / 1000).toFixed(6)}`);
  }

  const last = runs[runs.length - 1];
  const normalizedLastPath = last.path.replace(/\\/g, '/').replace(/'/g, "'\\''");
  lines.push(`file '${normalizedLastPath}'`);

  await fs.writeFile(concatPath, `${lines.join('\n')}\n`);
}

async function buildExpandedEncodeFrames(tempDir, runs, sampleDelayMs) {
  const encodeDir = path.join(tempDir, 'encode_frames');
  await removeDir(encodeDir);
  await ensureDir(encodeDir);

  let frameIndex = 0;
  for (const run of runs) {
    const repeat = Math.max(1, Math.round(run.durationMs / sampleDelayMs));
    for (let i = 0; i < repeat; i += 1) {
      const outPath = path.join(encodeDir, `enc_${String(frameIndex).padStart(4, '0')}.png`);
      await fs.copyFile(run.path, outPath);
      frameIndex += 1;
    }
  }

  return { encodeDir, expandedFrameCount: frameIndex };
}

function buildWebpCodecArgs({ animated, lossless, quality }) {
  const codec = animated ? 'libwebp_anim' : 'libwebp';
  if (lossless) {
    return [
      '-vcodec',
      codec,
      '-lossless',
      '1',
      '-quality',
      '100',
      '-compression_level',
      '6',
    ];
  }

  return [
    '-vcodec',
    codec,
    '-lossless',
    '0',
    '-quality',
    String(quality),
  ];
}

async function capturePanelWebp({
  page,
  comicName,
  panelName,
  frameElement,
  outputRoot,
  frameCount,
  frameDelayMs,
  minCycleFrames,
  gifOversample,
  timingScale,
  settleHoldMs,
  maxPanelCaptureMs,
  forceLoopEnable,
  oneShotLikely,
  expectedDurationMs,
  gifDelayProfile,
  lossless,
  quality,
}) {
  const comicDir = path.join(outputRoot, comicName);
  await ensureDir(comicDir);

  const outputFile = path.join(comicDir, `${panelName}.webp`);
  const tempDir = path.join(outputRoot, '.tmp', `${comicName}_${panelName}`);

  await removeDir(tempDir);
  await ensureDir(tempDir);

  const targetDelayMs = Math.max(1, Math.round(frameDelayMs));
  const oversample = Math.max(1, Math.round(gifOversample));
  const sampleDelayMs = Math.max(10, Math.floor(targetDelayMs / oversample));
  const baseDurationMs = Math.max(1, frameCount * targetDelayMs);
  const oneShotDurationMs = oneShotLikely && Number.isFinite(expectedDurationMs)
    ? expectedDurationMs + Math.max(0, settleHoldMs)
    : 0;
  const desiredDurationMs = Math.max(baseDurationMs, oneShotDurationMs);
  const boundedDurationMs = Math.max(
    1,
    Math.min(Math.max(1, maxPanelCaptureMs), desiredDurationMs),
  );
  const totalSamples = Math.max(
    1,
    Math.max(frameCount, Math.ceil(boundedDurationMs / sampleDelayMs)),
  );

  const frameInfos = [];
  for (let i = 0; i < totalSamples; i += 1) {
    const pngName = `frame_${String(i).padStart(3, '0')}.png`;
    const pngPath = path.join(tempDir, pngName);
    const pngBuffer = await frameElement.screenshot();
    await fs.writeFile(pngPath, pngBuffer);
    frameInfos.push({
      path: pngPath,
      hash: bufferHash(pngBuffer),
      capturedAt: Date.now(),
    });
    if (i < totalSamples - 1) {
      await page.waitForTimeout(sampleDelayMs);
    }
  }

  for (let i = 0; i < frameInfos.length; i += 1) {
    if (i < frameInfos.length - 1) {
      frameInfos[i].durationMs = Math.max(1, frameInfos[i + 1].capturedAt - frameInfos[i].capturedAt);
    } else {
      frameInfos[i].durationMs = frameInfos.length > 1
        ? frameInfos[i - 1].durationMs
        : targetDelayMs;
    }
  }

  const hashes = frameInfos.map((frame) => frame.hash);
  const uniqueHashes = new Set(hashes);
  let cycleLength = null;
  let animated = false;
  let encodedFrames = 1;

  if (uniqueHashes.size === 1) {
    runFfmpeg([
      '-y',
      '-i',
      frameInfos[0].path,
      ...buildWebpCodecArgs({ animated: false, lossless, quality }),
      outputFile,
    ]);
  } else {
    const sampleRuns = collapseFrameRuns(frameInfos, sampleDelayMs);
    const runHashes = sampleRuns.map((run) => run.hash);

    let cycleStart = 0;
    for (let offset = 0; offset < Math.min(16, Math.floor(runHashes.length / 3)); offset += 1) {
      const detected = detectCycleLength(runHashes.slice(offset), minCycleFrames);
      if (detected) {
        cycleStart = offset;
        cycleLength = detected;
        break;
      }
    }

    let runs;
    if (cycleLength) {
      const averaged = buildAveragedCycleRuns(sampleRuns, cycleStart, cycleLength, sampleDelayMs);
      runs = averaged && averaged.length > 0
        ? averaged
        : sampleRuns.slice(cycleStart, cycleStart + cycleLength);
    } else {
      runs = sampleRuns;
    }
    runs = mergeBoundaryRun([...runs]);

    if (oneShotLikely) {
      if (Array.isArray(gifDelayProfile) && gifDelayProfile.length > 0) {
        runs = remapRunDurationsToProfile(runs, gifDelayProfile);
      }
      const observedDurationMs = sumRunDurations(runs);
      if (Number.isFinite(expectedDurationMs) && expectedDurationMs > 0 && observedDurationMs > 0) {
        const adjust = expectedDurationMs / observedDurationMs;
        runs = runs.map((run) => ({
          ...run,
          durationMs: Math.max(10, Math.round(run.durationMs * adjust)),
        }));
      }
      if (settleHoldMs > 0 && runs.length > 0) {
        runs[runs.length - 1].durationMs += settleHoldMs;
      }
    } else {
      runs = quantizeRunDurations(runs, targetDelayMs);
      runs = scaleRunDurations(runs, timingScale);
    }
    encodedFrames = runs.length;

    if (runs.length <= 1) {
      const singleFrame = runs[0] ? runs[0].path : frameInfos[0].path;
      runFfmpeg([
        '-y',
        '-i',
        singleFrame,
        ...buildWebpCodecArgs({ animated: false, lossless, quality }),
        outputFile,
      ]);
      await removeDir(tempDir);
      return {
        outputFile,
        animated: false,
        capturedFrames: frameInfos.length,
        encodedFrames: 1,
        cycleLength,
      };
    }

    const { encodeDir, expandedFrameCount } = await buildExpandedEncodeFrames(
      tempDir,
      runs,
      sampleDelayMs,
    );
    const sampleFps = Math.max(1, Math.round(1000 / Math.max(1, sampleDelayMs)));

    const animatedLoopCount = forceLoopEnable ? 0 : (oneShotLikely ? 1 : 0);
    runFfmpeg([
      '-y',
      '-framerate',
      String(sampleFps),
      '-i',
      path.join(encodeDir, 'enc_%04d.png'),
      '-loop',
      String(animatedLoopCount),
      '-an',
      ...buildWebpCodecArgs({ animated: true, lossless, quality }),
      outputFile,
    ]);
    if (!forceLoopEnable && oneShotLikely) {
      patchWebpAnimLoopCount(outputFile, 1);
    }
    animated = true;
  }

  await removeDir(tempDir);
  return {
    outputFile,
    animated,
    capturedFrames: frameInfos.length,
    encodedFrames,
    cycleLength,
    sampling: {
      targetDelayMs,
      sampleDelayMs,
      oversample,
      totalSamples,
      desiredDurationMs,
      boundedDurationMs,
      oneShotLikely,
      expectedDurationMs,
    },
  };
}

async function findPanelNames(page) {
  return page.evaluate(() => {
    const isPanelName = (name) => /^title$/i.test(name || '') || /^p\d+$/i.test(name || '');
    const panelNames = Array.from(document.querySelectorAll('a[name]'))
      .map((el) => el.getAttribute('name'))
      .filter((name) => isPanelName(name))
      .map((name) => name.toLowerCase());

    const uniq = [...new Set(panelNames)];
    uniq.sort((a, b) => {
      if (a === 'title') return -1;
      if (b === 'title') return 1;
      return Number(a.slice(1)) - Number(b.slice(1));
    });
    return uniq;
  });
}

async function findGifUrlsInFrame(frameElement) {
  return frameElement.evaluate((el) => {
    const urls = [];
    const images = Array.from(el.querySelectorAll('img[src]'));
    for (const img of images) {
      const rawSrc = img.getAttribute('src') || '';
      if (!/\.gif(?:$|[?#])/i.test(rawSrc)) {
        continue;
      }
      try {
        urls.push(new URL(rawSrc, document.baseURI).href);
      } catch (_error) {
        // Ignore malformed image URLs.
      }
    }
    return [...new Set(urls)];
  });
}

async function restartGifAnimationsInFrame(frameElement) {
  await frameElement.evaluate((el) => {
    const now = String(Date.now());
    const images = Array.from(el.querySelectorAll('img[src]'));
    let counter = 0;

    for (const img of images) {
      const rawSrc = img.getAttribute('src') || '';
      if (!/\.gif(?:$|[?#])/i.test(rawSrc)) {
        continue;
      }

      try {
        const url = new URL(rawSrc, document.baseURI);
        url.searchParams.set('_capture_restart', `${now}_${counter}`);
        counter += 1;
        img.src = url.href;
      } catch (_error) {
        // Ignore malformed image URLs.
      }
    }
  });
}

async function findFrameElement(page, panelName) {
  const handle = await page.evaluateHandle((name) => {
    const frameSelector = 'td[bgcolor="999999"][width="266"][height="234"]';
    const panelRe = /^(?:title|p\d+)$/i;

    const anchor = document.querySelector(`a[name="${name}"]`);
    if (!anchor) return null;

    const inner = anchor.querySelector(frameSelector);
    if (inner) return inner;

    let node = anchor.nextElementSibling;
    while (node) {
      const nName = node.getAttribute ? node.getAttribute('name') : null;
      if (node.tagName === 'A' && panelRe.test(nName || '')) {
        break;
      }

      if (node.matches && node.matches(frameSelector)) {
        return node;
      }
      if (node.querySelector) {
        const found = node.querySelector(frameSelector);
        if (found) return found;
      }

      node = node.nextElementSibling;
    }

    const allPanels = Array.from(document.querySelectorAll('a[name]')).filter((el) =>
      panelRe.test(el.getAttribute('name') || ''),
    );
    const idx = allPanels.findIndex((el) => (el.getAttribute('name') || '').toLowerCase() === name.toLowerCase());
    if (idx >= 0) {
      const allFrames = Array.from(document.querySelectorAll(frameSelector));
      if (idx < allFrames.length) {
        return allFrames[idx];
      }
    }

    return null;
  }, panelName);

  const element = handle.asElement();
  if (!element) {
    await handle.dispose();
    return null;
  }
  return { handle, element };
}

async function renderFullComicWebp({
  context,
  comicName,
  panels,
  outputDir,
  frameCount,
  frameDelayMs,
  minCycleFrames,
  gifOversample,
  timingScale,
  settleHoldMs,
  maxPanelCaptureMs,
  forceLoopEnable,
  lossless,
  quality,
}) {
  const comicDir = path.join(outputDir, comicName);
  const panelPaths = panels
    .map((panel) => path.resolve(panel.output))
    .filter((panelPath) => panelPath.endsWith('.webp'));

  if (panelPaths.length === 0) {
    return null;
  }

  const panelRelPaths = panelPaths
    .map((panelPath) => path.relative(comicDir, panelPath).replace(/\\/g, '/'))
    .filter((relPath) => relPath && !relPath.startsWith('..'));

  if (panelRelPaths.length === 0) {
    return null;
  }

  const imageTags = panelRelPaths
    .map((relPath) => `<img src="${relPath}" alt="">`)
    .join('');
  const stackHtmlPath = path.join(comicDir, '.full_stack.html');
  await fs.writeFile(
    stackHtmlPath,
    `<!doctype html><html><head><meta charset="utf-8"><style>` +
      `html,body{margin:0;padding:0;background:transparent;overflow:auto;}` +
      `#stack{display:block;}` +
      `#stack img{display:block;margin:0;padding:0;}` +
      `</style></head><body><div id="stack">${imageTags}</div></body></html>`,
  );

  const fullPage = await context.newPage();

  try {
    await fullPage.goto(pathToFileURL(stackHtmlPath).href, { waitUntil: 'load', timeout: 15000 });

    await fullPage.evaluate(async () => {
      const imgs = Array.from(document.querySelectorAll('#stack img'));
      await Promise.all(imgs.map((img) => img.decode().catch(() => {})));
    });
    await fullPage.waitForTimeout(120);

    const stackHandle = await fullPage.$('#stack');
    if (!stackHandle) {
      throw new Error('full-stack-not-found');
    }

    const metrics = await fullPage.evaluate(() => {
      const el = document.getElementById('stack');
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        width: Math.ceil(rect.width),
        height: Math.ceil(rect.height),
      };
    });

    if (metrics && metrics.width > 0 && metrics.height > 0) {
      await fullPage.setViewportSize({
        width: Math.max(1, Math.min(2048, metrics.width)),
        height: Math.max(1, Math.min(3000, metrics.height)),
      });
      await fullPage.waitForTimeout(60);
    } else {
      throw new Error('full-stack-zero-size');
    }

    try {
      const captured = await capturePanelWebp({
        page: fullPage,
        comicName,
        panelName: 'full',
        frameElement: stackHandle,
        outputRoot: outputDir,
        frameCount,
        frameDelayMs,
        minCycleFrames,
        gifOversample: 1,
        timingScale,
        settleHoldMs,
        maxPanelCaptureMs,
        forceLoopEnable,
        oneShotLikely: false,
        expectedDurationMs: null,
        gifDelayProfile: null,
        lossless,
        quality,
      });

      return {
        output: path.relative(process.cwd(), captured.outputFile),
        animated: captured.animated,
        capturedFrames: captured.capturedFrames,
        encodedFrames: captured.encodedFrames,
        cycleLength: captured.cycleLength,
        panels: panelRelPaths.length,
      };
    } finally {
      await stackHandle.dispose();
    }
  } finally {
    await fullPage.close();
  }
}

async function processComic({
  browser,
  comic,
  pagesDir,
  outputDir,
  serveRoot,
  serverOrigin,
  timeoutMs,
  frameCount,
  frameDelayMs,
  minCycleFrames,
  captureZoom,
  deviceScaleFactor,
  gifOversample,
  timingScale,
  settleHoldMs,
  maxPanelCaptureMs,
  forceLoopEnable,
  renderFullWebp,
  browserLocale,
  lossless,
  quality,
}) {
  const comicPath = path.resolve(pagesDir, comic.name);
  const servedComicUrl =
    serveRoot && serverOrigin ? filePathToHttpUrl(comicPath, serveRoot, serverOrigin) : null;
  const comicUrl = servedComicUrl || pathToFileURL(comicPath).href;
  const comicName = path.parse(comic.name).name;

  const context = await browser.newContext({
    viewport: { width: 1280, height: 960 },
    deviceScaleFactor,
    locale: browserLocale,
  });
  const page = await context.newPage();
  const result = {
    comic: comic.name,
    source: servedComicUrl ? 'http' : 'file',
    panels: [],
    failures: [],
  };

  try {
    await page.goto(comicUrl, { waitUntil: 'load', timeout: timeoutMs });

    if (captureZoom !== 1) {
      await page.evaluate((zoom) => {
        document.documentElement.style.zoom = String(zoom);
      }, captureZoom);
      await page.waitForTimeout(150);
    }

    result.i18n = await waitForI18nLanguage(
      page,
      browserLocale,
      Math.min(6000, Math.max(1500, Math.floor(timeoutMs * 0.5))),
    );

    const panelNames = await findPanelNames(page);

    for (const panelName of panelNames) {
      try {
        await page.evaluate((name) => {
          window.location.hash = name;
        }, panelName);
        await page.waitForTimeout(220);

        const frame = await findFrameElement(page, panelName);
        if (!frame) {
          result.failures.push({ panel: panelName, reason: 'frame-not-found' });
          continue;
        }

        try {
          const panelGifUrls = await findGifUrlsInFrame(frame.element);
          const gifTiming = getPanelGifTiming(panelGifUrls);
          const panelFrameDelayMs =
            Number.isFinite(gifTiming.minDelayMs) ? gifTiming.minDelayMs : frameDelayMs;

          if (gifTiming.oneShotLikely && gifTiming.parsedGifCount > 0) {
            await restartGifAnimationsInFrame(frame.element);
            await page.waitForTimeout(80);
          }

          const captured = await capturePanelWebp({
            page,
            comicName,
            panelName,
            frameElement: frame.element,
            outputRoot: outputDir,
            frameCount,
            frameDelayMs: panelFrameDelayMs,
            minCycleFrames,
            gifOversample,
            timingScale,
            settleHoldMs,
            maxPanelCaptureMs,
            forceLoopEnable,
            oneShotLikely: gifTiming.oneShotLikely,
            expectedDurationMs: gifTiming.expectedDurationMs,
            gifDelayProfile: gifTiming.primaryDelayProfile,
            lossless,
            quality,
          });

          result.panels.push({
            panel: panelName,
            output: path.relative(process.cwd(), captured.outputFile),
            animated: captured.animated,
            capturedFrames: captured.capturedFrames,
            encodedFrames: captured.encodedFrames,
            cycleLength: captured.cycleLength,
            gifCount: panelGifUrls.length,
            parsedGifCount: gifTiming.parsedGifCount,
            gifMinDelayMs: gifTiming.minDelayMs,
            oneShotLikely: gifTiming.oneShotLikely,
            gifExpectedDurationMs: gifTiming.expectedDurationMs,
            gifDelayProfileLength: gifTiming.primaryDelayProfile
              ? gifTiming.primaryDelayProfile.length
              : 0,
            captureFrameDelayMs: panelFrameDelayMs,
            sampleDelayMs: captured.sampling.sampleDelayMs,
            sampledFrames: captured.sampling.totalSamples,
            oversample: captured.sampling.oversample,
            sampledDurationMs: captured.sampling.boundedDurationMs,
          });
        } finally {
          await frame.handle.dispose();
        }
      } catch (error) {
        result.failures.push({ panel: panelName, reason: String(error.message || error) });
      }
    }

    if (renderFullWebp) {
      try {
        const full = await renderFullComicWebp({
          context,
          comicName,
          panels: result.panels,
          outputDir,
          frameCount,
          frameDelayMs,
          minCycleFrames,
          gifOversample,
          timingScale,
          settleHoldMs,
          maxPanelCaptureMs,
          forceLoopEnable,
          lossless,
          quality,
        });

        if (full) {
          result.full = full;
        }
      } catch (error) {
        result.failures.push({ panel: 'full', reason: String(error.message || error) });
      }
    }
  } finally {
    await page.close();
    await context.close();
  }

  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const pagesDir = path.resolve(options.pagesDir);
  const outputDir = path.resolve(options.outputDir);
  const serveRoot = path.resolve(pagesDir, '..');

  const comics = await listComicFiles(pagesDir, options.start, options.end, options.maxComics);
  if (comics.length === 0) {
    throw new Error('No comic files matched the given range/options.');
  }

  await ensureDir(outputDir);

  const summary = {
    options,
    comics: comics.length,
    generatedAt: new Date().toISOString(),
    results: [],
  };

  let staticServer = null;
  let browser = null;
  try {
    staticServer = await startStaticServer(serveRoot);
    console.log(`[server] ${staticServer.origin} (root=${serveRoot})`);

    browser = await chromium.launch({
      headless: true,
      executablePath: options.chromiumPath,
    });

    for (const comic of comics) {
      console.log(`[capture] ${comic.name}`);
      const comicResult = await processComic({
        browser,
        comic,
        pagesDir,
        outputDir,
        serveRoot: staticServer.rootDir,
        serverOrigin: staticServer.origin,
        timeoutMs: options.timeoutMs,
        frameCount: options.frameCount,
        frameDelayMs: options.frameDelayMs,
        minCycleFrames: options.minCycleFrames,
        captureZoom: options.captureZoom,
        deviceScaleFactor: options.deviceScaleFactor,
        gifOversample: options.gifOversample,
        timingScale: options.timingScale,
        settleHoldMs: options.settleHoldMs,
        maxPanelCaptureMs: options.maxPanelCaptureMs,
        forceLoopEnable: options.forceLoopEnable,
        renderFullWebp: options.renderFullWebp,
        browserLocale: options.browserLocale,
        lossless: options.lossless,
        quality: options.quality,
      });
      summary.results.push(comicResult);
      const i18nResolved = comicResult.i18n ? comicResult.i18n.resolved : null;
      const i18nSuffix = i18nResolved
        ? `, i18n=${i18nResolved}${comicResult.i18n.timedOut ? ' (timeout)' : ''}`
        : comicResult.i18n && comicResult.i18n.available === false
          ? ', i18n=unavailable'
          : '';
      console.log(
        `  source=${comicResult.source}, panels=${comicResult.panels.length}, failures=${comicResult.failures.length}${i18nSuffix}`,
      );
    }
  } finally {
    if (browser) {
      await browser.close();
    }
    if (staticServer) {
      await stopStaticServer(staticServer.server);
    }
  }

  const manifestPath = path.join(outputDir, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(summary, null, 2));

  const totalPanels = summary.results.reduce((acc, item) => acc + item.panels.length, 0);
  const totalFailures = summary.results.reduce((acc, item) => acc + item.failures.length, 0);
  console.log(`done: comics=${summary.comics}, panels=${totalPanels}, failures=${totalFailures}`);
  console.log(`manifest: ${manifestPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
