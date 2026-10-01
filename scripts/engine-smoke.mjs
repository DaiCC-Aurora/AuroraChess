#!/usr/bin/env node
/**
 * Engine smoke test — boots the *vendored* WASM build and speaks real UCI to it.
 *
 * This is the Node-side counterpart to `public/engine-selftest.html`: it proves
 * the binary in `public/engine/` boots, reports the options the difficulty
 * model depends on, and actually searches.
 *
 *   node scripts/engine-smoke.mjs [elo]
 *
 * Exit code 0 only when every check passes.
 */
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const enginePath = path.join(root, 'public', 'engine', 'stockfish.js');
const elo = Number(process.argv[2] ?? 1600);

const lines = [];
const originalLog = console.log;
// The engine writes its protocol output through the module's `print`, which
// ends up on console.log; capture it instead of letting it flood the report.
console.log = (...args) => {
  const text = args.map(String).join(' ');
  for (const line of text.split(/\r?\n/)) if (line.trim()) lines.push(line.trim());
};

const initEngine = require('stockfish');

function waitFor(predicate, timeoutMs, label) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const found = lines.find(predicate);
      if (found) return resolve(found);
      if (Date.now() - started > timeoutMs) return reject(new Error(`timeout waiting for ${label}`));
      setTimeout(tick, 25);
    };
    tick();
  });
}

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  originalLog(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const engine = await initEngine(enginePath);
  check('vendored build boots', typeof engine?.sendCommand === 'function', enginePath.replace(root, '.'));

  engine.sendCommand('uci');
  await waitFor(l => l === 'uciok', 20000, 'uciok');

  const nameLine = lines.find(l => l.startsWith('id name'));
  check('engine identifies itself', !!nameLine, nameLine ?? '');

  const required = ['UCI_LimitStrength', 'UCI_Elo', 'Skill Level', 'MultiPV'];
  for (const option of required) {
    const line = lines.find(l => l.startsWith(`option name ${option} `));
    check(`reports option ${option}`, !!line, line ? line.replace('option name ', '') : 'missing');
  }
  const eloOption = lines.find(l => l.startsWith('option name UCI_Elo '));
  if (eloOption) {
    const min = / min (\d+)/.exec(eloOption)?.[1];
    const max = / max (\d+)/.exec(eloOption)?.[1];
    check('UCI_Elo range is sane', Number(min) <= 1320 && Number(max) >= 2800, `min=${min} max=${max}`);
  }

  // Weak-strength configuration must be accepted without error.
  engine.sendCommand('setoption name UCI_LimitStrength value true');
  engine.sendCommand(`setoption name UCI_Elo value ${Math.max(1320, elo)}`);
  engine.sendCommand('setoption name MultiPV value 3');
  engine.sendCommand('isready');
  await waitFor(l => l === 'readyok', 10000, 'readyok');

  const searchStart = lines.length;
  engine.sendCommand('position startpos moves e2e4 e7e5 g1f3 b8c6 f1b5');
  engine.sendCommand('go depth 12 movetime 3000');
  const best = await waitFor(l => l.startsWith('bestmove'), 40000, 'bestmove');
  const produced = lines.slice(searchStart);

  const move = best.split(/\s+/)[1];
  check('engine returns a legal-looking move', /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move ?? ''), best);

  const depths = produced
    .filter(l => l.startsWith('info') && l.includes(' depth '))
    .map(l => Number(l.split(' depth ')[1].split(' ')[0]))
    .filter(n => !Number.isNaN(n));
  check('search reports depth', depths.length > 0, `max depth ${depths.length ? Math.max(...depths) : 0}`);

  const multiPv = new Set(
    produced.filter(l => l.includes(' multipv ')).map(l => l.split(' multipv ')[1].split(' ')[0]),
  );
  check('MultiPV produces multiple lines', multiPv.size >= 2, `lines=${multiPv.size}`);

  check(
    'search reports a score',
    produced.some(l => / score (cp|mate) /.test(l)),
    produced.find(l => / score (cp|mate) /.test(l))?.slice(0, 90) ?? '',
  );

  engine.sendCommand('quit');

  const failed = checks.filter(c => !c.ok);
  originalLog(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch(error => {
  console.log = originalLog;
  console.error('engine smoke test failed:', error.message);
  process.exit(1);
});
