#!/usr/bin/env node
/**
 * Vendor the lichess piece set into /public/piece.
 *
 * lichess ships several piece sets; the default is "cburnett" by Colin M.L.
 * Burnett, the same artwork chessground renders. These are the exact files from
 * lichess-org/lila at `public/piece/cburnett/<color><Piece>.svg`.
 *
 * They are committed to the repo so a Vercel build never needs network access,
 * and re-running this script refreshes them.
 *
 *   node scripts/setup-pieces.mjs [--force]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'piece', 'cburnett');
const force = process.argv.includes('--force');

const PIECES = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'];

/**
 * jsDelivr mirrors the repo and is reachable where raw.githubusercontent.com is
 * not; both are tried so the script works from different networks.
 */
const SOURCES = [
  name => `https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/cburnett/${name}.svg`,
  name => `https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/cburnett/${name}.svg`,
];

async function download(name) {
  const errors = [];
  for (const source of SOURCES) {
    const url = source(name);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        errors.push(`${url} -> HTTP ${response.status}`);
        continue;
      }
      const svg = (await response.text()).trim();
      if (!svg.startsWith('<svg') || !svg.includes('viewBox')) {
        errors.push(`${url} -> not an SVG`);
        continue;
      }
      return svg;
    } catch (error) {
      errors.push(`${url} -> ${error.message}`);
    }
  }
  throw new Error(`could not download ${name}.svg:\n  ${errors.join('\n  ')}`);
}

fs.mkdirSync(outDir, { recursive: true });
let downloaded = 0;
let skipped = 0;

for (const name of PIECES) {
  const target = path.join(outDir, `${name}.svg`);
  if (fs.existsSync(target) && !force) {
    skipped++;
    continue;
  }
  const svg = await download(name);
  fs.writeFileSync(target, svg.endsWith('\n') ? svg : `${svg}\n`);
  downloaded++;
  console.log(`  ${name}.svg  ${(svg.length / 1024).toFixed(2)} KB`);
}

const license = `Piece artwork: "cburnett" chess pieces
Author:       Colin M.L. Burnett
Source:       https://github.com/lichess-org/lila/tree/master/public/piece/cburnett
              (fetched by scripts/setup-pieces.mjs)
Licence:      GPLv2+ / CC BY-SA 3.0 — see the upstream repository for the
              authoritative terms. Files are redistributed unmodified.

These SVGs are used as-is as image assets; the rest of AuroraChess is separate
work that only references them by URL.
`;
fs.writeFileSync(path.join(outDir, 'LICENSE.txt'), license);

console.log(`\n${downloaded} downloaded, ${skipped} already present -> ${path.relative(root, outDir)}`);
