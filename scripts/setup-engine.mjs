#!/usr/bin/env node
/**
 * Vendor the Stockfish WASM build from node_modules into /public/engine so the
 * browser can load it as a plain Web Worker.
 *
 * Why copy instead of importing from node_modules?
 *  - The engine must be served as a static asset with a stable URL, because the
 *    WASM build resolves its own binary relative to its script URL
 *    (`location.pathname.replace(/\.js$/, '.wasm')`).
 *  - Bundlers must not touch it: emscripten + webpack/turbopack worker handling
 *    is fragile, static files are not.
 *
 * The build loaded by default is the "lite single-threaded" one:
 *   ~1.7 MB WASM, no SharedArrayBuffer / COOP-COEP headers required, and still
 *   far stronger than a human. Suitable for phones and even watches.
 *
 * Usage:
 *   node scripts/setup-engine.mjs            # lite single-threaded (default)
 *   node scripts/setup-engine.mjs --full     # full NNUE single-threaded (~95MB, /engine-mt)
 *   node scripts/setup-engine.mjs --check    # only report what is installed
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'node_modules', 'stockfish', 'bin');
const outDir = path.join(root, 'public', 'engine');
const manifestPath = path.join(root, 'src', 'generated', 'engine-manifest.json');

const args = process.argv.slice(2);
const useFull = args.includes('--full');
const checkOnly = args.includes('--check');

/** Candidate builds, best (smallest that is strong enough) first. */
const BUILDS = {
  lite: {
    label: 'Stockfish 19 Lite (single-threaded WASM)',
    js: 'stockfish-19-lite-single.js',
    wasm: 'stockfish-19-lite-single.wasm',
    threads: 1,
    sharedArrayBuffer: false,
    strength: 'light',
  },
  full: {
    label: 'Stockfish 19 (single-threaded WASM, full NNUE)',
    js: 'stockfish-19-single.js',
    wasm: 'stockfish-19-single.wasm',
    threads: 1,
    sharedArrayBuffer: false,
    strength: 'full',
  },
};

function pkgVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', 'stockfish', 'package.json'), 'utf8'));
    return pkg.version;
  } catch {
    return 'unknown';
  }
}

function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

if (checkOnly) {
  const manifest = readManifest();
  const present = fs.existsSync(path.join(outDir, 'stockfish.js')) && fs.existsSync(path.join(outDir, 'stockfish.wasm'));
  console.log(present ? 'engine assets: OK' : 'engine assets: MISSING (run `npm run engine:setup`)');
  console.log(JSON.stringify(manifest, null, 2));
  process.exit(present ? 0 : 1);
}

const build = useFull ? BUILDS.full : BUILDS.lite;
const srcJs = path.join(srcDir, build.js);
const srcWasm = path.join(srcDir, build.wasm);

if (!fs.existsSync(srcJs) || !fs.existsSync(srcWasm)) {
  console.error(
    `Could not find ${build.js} / ${build.wasm} in ${srcDir}.\n` +
      'Run `npm install` first (and make sure the stockfish package was not pruned).',
  );
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });

// Canonical names: the worker glue derives the wasm URL from the *script* URL,
// so naming the pair stockfish.js / stockfish.wasm is what makes it resolve.
const files = [
  [srcJs, path.join(outDir, 'stockfish.js')],
  [srcWasm, path.join(outDir, 'stockfish.wasm')],
];
for (const [from, to] of files) {
  fs.copyFileSync(from, to);
  console.log(`copied ${path.relative(root, from)} -> ${path.relative(root, to)} (${(fs.statSync(to).size / 1024 / 1024).toFixed(2)} MB)`);
}

// Ship the licence next to the binary: Stockfish is GPL-3.0.
const copying = path.join(root, 'node_modules', 'stockfish', 'Copying.txt');
if (fs.existsSync(copying)) fs.copyFileSync(copying, path.join(outDir, 'LICENSE-stockfish.txt'));

const manifest = {
  engine: build.label,
  version: pkgVersion(),
  workerUrl: '/engine/stockfish.js',
  wasmUrl: '/engine/stockfish.wasm',
  wasmBytes: fs.statSync(path.join(outDir, 'stockfish.wasm')).size,
  jsBytes: fs.statSync(path.join(outDir, 'stockfish.js')).size,
  threads: build.threads,
  requiresSharedArrayBuffer: build.sharedArrayBuffer,
  strength: build.strength,
  source: `stockfish@${pkgVersion()} (npm) bin/${build.js}`,
  license: 'GPL-3.0',
  generatedAt: new Date().toISOString(),
};
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`wrote ${path.relative(root, manifestPath)}`);
