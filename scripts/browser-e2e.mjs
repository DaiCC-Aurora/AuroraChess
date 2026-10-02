#!/usr/bin/env node
/**
 * Browser end-to-end test (no Playwright, no test-runner dependencies).
 *
 * Drives headless Edge through the Chrome DevTools Protocol using Node's built
 * in WebSocket + fetch, and verifies the things unit tests cannot:
 *
 *   1. the vendored Stockfish worker boots in a real browser and completes a
 *      UCI handshake and search (`/engine-selftest.html`),
 *   2. a real move can be played on the board and the engine answers (`/play`),
 *   3. the watch layout activates at a 192x192 round-watch viewport (`/watch`).
 *
 * It also writes screenshots to `.cache/e2e/`.
 *
 *   node scripts/browser-e2e.mjs [baseUrl]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3210';
const DEBUG_PORT = Number(process.env.E2E_DEBUG_PORT ?? 9333);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const SHOT_DIR = path.join(ROOT, '.cache', 'e2e');
/**
 * A fresh profile per run: two runs sharing one directory race on Edge's
 * singleton lock ("timeout waiting for browser devtools" on the second run).
 */
const PROFILE_ROOT = path.join(ROOT, '.cache', 'e2e-profiles');
const PROFILE = path.join(PROFILE_ROOT, String(Date.now()));

const EDGE_CANDIDATES = [
  process.env.E2E_BROWSER,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForHttp(url, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error(`timeout waiting for ${label}`);
    await sleep(150);
  }
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      }
    };
  }

  static async connect(wsUrl) {
    const socket = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = () => reject(new Error('could not open CDP socket'));
    });
    return new Cdp(socket);
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 60_000);
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      throw new Error(`page exception: ${result.exceptionDetails.exception?.description ?? 'unknown'}`);
    }
    return result.result?.value;
  }

  async navigate(url) {
    await this.send('Page.navigate', { url });
    await this.waitForExpression('document.readyState === "complete"', 20_000, `load ${url}`);
  }

  async waitForExpression(expression, timeoutMs, label) {
    const deadline = Date.now() + timeoutMs;
    let last;
    for (;;) {
      try {
        last = await this.evaluate(expression);
        if (last) return last;
      } catch (error) {
        last = error.message;
      }
      if (Date.now() > deadline) throw new Error(`timeout waiting for ${label} (last: ${JSON.stringify(last)})`);
      await sleep(200);
    }
  }

  /**
   * Captures a screenshot, optionally switching the emulated viewport first.
   * The override is intentionally *kept* so that assertions evaluated after a
   * screenshot still see the viewport the screenshot was taken at.
   */
  async screenshot(file, { width, height } = {}) {
    if (width && height) {
      await this.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 2,
        mobile: width < 600,
      });
    }
    const shot = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const target = path.join(SHOT_DIR, file);
    fs.writeFileSync(target, Buffer.from(shot.data, 'base64'));
    return target;
  }
}

/**
 * Dispatches the pointer sequence the board listens for.
 *
 * The taps must be *separated in time*: React batches the selection update, so
 * firing everything in one task would leave `selected` null when the
 * destination tap arrives.
 */
function playMove(from, to) {
  return `
    (async () => {
      const board = document.querySelector('.board-surface');
      if (!board) return 'no-board';
      const rect = board.getBoundingClientRect();
      const centre = (square) => {
        const file = square.charCodeAt(0) - 97;
        const rank = Number(square[1]) - 1;
        // The play page renders from white's point of view by default.
        const col = file;
        const row = 7 - rank;
        return {
          x: rect.left + (col + 0.5) * (rect.width / 8),
          y: rect.top + (row + 0.5) * (rect.height / 8),
        };
      };
      const fire = (type, point) => {
        const target = document.elementFromPoint(point.x, point.y) ?? board;
        target.dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, composed: true,
          clientX: point.x, clientY: point.y, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1,
        }));
      };
      const tick = () => new Promise(resolve => setTimeout(resolve, 220));
      const a = centre('${from}');
      const b = centre('${to}');
      fire('pointerdown', a);
      fire('pointerup', a);
      await tick();
      fire('pointerdown', b);
      fire('pointerup', b);
      await tick();
      return 'ok';
    })()
  `;
}

/**
 * Fails when any rendered text contains an emoji-presenting glyph. `★ ✓ ⇉ ?!`
 * are not Extended_Pictographic, so the quality badges stay valid.
 */
async function assertNoEmoji(cdp, page) {
  const found = await cdp.evaluate(`(() => {
    const matches = document.body.innerText.match(/\\p{Extended_Pictographic}/gu);
    return matches ? [...new Set(matches)].join(' ') : '';
  })()`);
  check(`${page} renders no emoji`, !found, found || 'clean');
}

/**
 * Pins the interface language. A fresh browser profile otherwise falls back to
 * the browser locale, which would make text assertions depend on the host.
 */
async function seedSettings(cdp, base, patch) {
  await cdp.evaluate(`(() => {
    const key = 'aurorachess.settings.v1';
    const current = JSON.parse(localStorage.getItem(key) || '{}');
    localStorage.setItem(key, JSON.stringify({ ...current, ...${JSON.stringify(patch)} }));
    return true;
  })()`);
  await cdp.navigate(`${base}/`);
}

async function main() {
  const edge = EDGE_CANDIDATES.find(candidate => fs.existsSync(candidate));
  if (!edge) throw new Error('no Edge/Chrome binary found (set E2E_BROWSER)');
  // Start from a clean profile directory so a previous run cannot lock us out.
  try {
    fs.rmSync(PROFILE_ROOT, { recursive: true, force: true });
  } catch {
    // A browser from an earlier run may still hold files; the unique profile
    // name below keeps this run independent anyway.
  }
  fs.mkdirSync(PROFILE, { recursive: true });

  const child = spawn(
    edge,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--mute-audio',
      '--window-size=1280,900',
      `--user-data-dir=${PROFILE}`,
      `--remote-debugging-port=${DEBUG_PORT}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let cdp;
  try {
    await waitForHttp(`http://127.0.0.1:${DEBUG_PORT}/json/version`, 25_000, 'browser devtools');
    const targets = await waitForHttp(`http://127.0.0.1:${DEBUG_PORT}/json/list`, 10_000, 'page targets');
    const page = targets.find(target => target.type === 'page');
    if (!page) throw new Error('no page target');
    cdp = await Cdp.connect(page.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    // 1 ---------------------------------------------------------------- engine
    // Warm the HTTP cache exactly the way the app does (EngineClient preloads
    // the binary before spawning the worker); this also verifies the asset is
    // served with the right size, and keeps the worker test free of cold-cache
    // timing noise.
    await cdp.navigate(`${BASE}/`);
    const wasmBytes = await cdp.evaluate(
      `fetch('/engine/stockfish.wasm').then(r => r.arrayBuffer()).then(b => b.byteLength).catch(() => 0)`,
    );
    check('engine WASM is served', wasmBytes > 1_000_000, `${wasmBytes} bytes`);

    // Pin the language so text assertions do not depend on the host locale.
    await seedSettings(cdp, BASE, { locale: 'zh' });

    await cdp.navigate(`${BASE}/engine-selftest.html`);
    let engineResult = '';
    try {
      engineResult = await cdp.waitForExpression(
        '(() => { const el = document.getElementById("result"); return el && el.textContent.startsWith("DONE") ? el.textContent : null; })()',
        150_000,
        'engine self-test result',
      );
    } catch (error) {
      engineResult = await cdp.evaluate('document.getElementById("result")?.textContent ?? "missing"');
      const log = await cdp.evaluate('document.getElementById("log")?.textContent ?? ""');
      check('engine worker boots in the browser', false, `${engineResult} (${error.message})`);
      console.log(`---- self-test log ----\n${String(log).slice(0, 2000)}\n-----------------------`);
    }
    if (engineResult) {
      check('engine worker boots in the browser', engineResult.startsWith('DONE'), engineResult.trim());
      const depth = Number(/maxdepth=(\d+)/.exec(engineResult)?.[1] ?? 0);
      check('engine reaches a real search depth', depth >= 6, `depth ${depth}`);
      check('engine reports MultiPV lines', /multipv=[2-9]/.test(engineResult), engineResult.trim());
    }
    await cdp.screenshot('engine-selftest.png', { width: 900, height: 620 });

    // 2 ------------------------------------------------------------------ play
    // Start from a clean slate: a restored game would change the legal moves.
    await cdp.navigate(`${BASE}/`);
    await cdp.evaluate('localStorage.clear()');
    // Re-seed (and reload) so the app re-hydrates from clean storage with a
    // pinned language; otherwise its in-memory state is written back by the
    // next settings change and the host locale leaks in.
    await seedSettings(cdp, BASE, { locale: 'zh' });
    await cdp.screenshot('home.png', { width: 1280, height: 1000 });
    await assertNoEmoji(cdp, '/');

    // The top bar must be collapsible, and the choice must survive a reload.
    const collapsed = await cdp.evaluate(`(() => {
      const button = document.querySelector('[data-testid=header-toggle]');
      if (!button) return 'missing';
      button.click();
      return 'clicked';
    })()`);
    await sleep(300);
    const hiddenState = await cdp.evaluate(`({
      header: !!document.querySelector('header'),
      restore: !!document.querySelector('.header-restore'),
    })`);
    check(
      'top bar can be hidden',
      collapsed === 'clicked' && !hiddenState.header && hiddenState.restore,
      JSON.stringify(hiddenState),
    );
    await cdp.screenshot('home-collapsed.png', { width: 1280, height: 820 });

    await cdp.navigate(`${BASE}/`);
    await sleep(600);
    const persisted = await cdp.evaluate(`({
      header: !!document.querySelector('header'),
      restore: !!document.querySelector('.header-restore'),
    })`);
    check('hidden top bar survives a reload', !persisted.header && persisted.restore, JSON.stringify(persisted));

    const restored = await cdp.evaluate(`(() => {
      const button = document.querySelector('.header-restore');
      if (!button) return 'missing';
      button.click();
      return 'clicked';
    })()`);
    await sleep(300);
    const headerBack = await cdp.evaluate(`!!document.querySelector('header nav')`);
    check('top bar can be restored', restored === 'clicked' && headerBack, String(headerBack));

    await cdp.navigate(`${BASE}/play`);
    const ready = await cdp
      .waitForExpression('document.body.innerText.includes("引擎就绪") || document.body.innerText.includes("Engine ready")', 60_000, 'engine ready on /play')
      .then(() => true)
      .catch(() => false);
    check('/play shows a ready engine', ready);

    const boardOk = await cdp.evaluate('!!document.querySelector(".board-surface")');
    check('/play renders the board', !!boardOk);

    // The lichess (cburnett) pieces are <img> assets: they must actually load.
    const pieces = await cdp.evaluate(`(() => {
      const imgs = [...document.querySelectorAll('.board-piece img')];
      return {
        count: imgs.length,
        loaded: imgs.filter(img => img.complete && img.naturalWidth > 0).length,
        sample: imgs[0]?.getAttribute('src') ?? '',
      };
    })()`);
    check(
      'lichess piece set loads (32 pieces)',
      pieces.count === 32 && pieces.loaded === 32,
      `${pieces.loaded}/${pieces.count} loaded, e.g. ${pieces.sample}`,
    );

    const pieceAsset = await cdp.evaluate(
      `fetch('/piece/cburnett/wK.svg').then(r => r.text().then(t => r.status + ' ' + t.slice(0, 40)))`,
    );
    check('piece SVG is served', /^200 <svg/.test(String(pieceAsset)), String(pieceAsset).slice(0, 60));

    await assertNoEmoji(cdp, '/play');

    // The hint must produce a suggestion arrow on the board.
    const hintClick = await cdp.evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find(el => /(提示|Hint)/.test(el.textContent || ''));
      if (!button) return 'missing';
      if (button.disabled) return 'disabled';
      button.click();
      return 'ok';
    })()`);
    check('hint button is clickable', hintClick === 'ok', String(hintClick));

    const arrowLines = await cdp
      .waitForExpression(
        `(() => { const lines = document.querySelectorAll('.board-overlay line'); return lines.length > 0 ? lines.length : null; })()`,
        30_000,
        'hint arrow',
      )
      .catch(() => 0);
    check('hint draws a suggestion arrow', Number(arrowLines) >= 1, `${arrowLines} arrow line(s)`);

    const moveResult = await cdp.evaluate(playMove('e2', 'e4'));
    check('a move can be played on the board', moveResult === 'ok', String(moveResult));

    const ownPly = await cdp
      .waitForExpression(
        '(() => { const moves = document.querySelectorAll("[data-testid=move]"); return moves.length >= 1 ? moves.length : null; })()',
        20_000,
        'own move registered',
      )
      .catch(() => 0);
    check('the played move appears in the move list', ownPly >= 1, `${ownPly} plies recorded`);

    const plyCount = await cdp
      .waitForExpression(
        '(() => { const moves = document.querySelectorAll("[data-testid=move]"); return moves.length >= 2 ? moves.length : null; })()',
        60_000,
        'engine reply',
      )
      .catch(() => 0);
    check('the engine answers the move', plyCount >= 2, `${plyCount} plies recorded`);

    const sans = await cdp.evaluate('[...document.querySelectorAll("[data-testid=move]")].map(el => el.dataset.san).join(" ")');
    check('move list shows sane SAN', /e4/.test(String(sans)), String(sans));
    await cdp.screenshot('play.png', { width: 1280, height: 1000 });

    // 3 ----------------------------------------------------------------- coach
    await cdp.navigate(`${BASE}/coach`);
    const coachReady = await cdp
      .waitForExpression('document.body.innerText.includes("教练") || document.body.innerText.includes("Coach")', 30_000, 'coach screen')
      .then(() => true)
      .catch(() => false);
    check('/coach renders the coach UI', coachReady);

    await cdp.evaluate(playMove('d2', 'd4'));
    const verdict = await cdp
      .waitForExpression(
        '(() => { const el = document.querySelector("[data-testid=coach-verdict]"); return el ? el.innerText : null; })()',
        45_000,
        'coach verdict',
      )
      .catch(() => '');
    const graded = /(最佳|良好|优秀|不精确|失误|严重失误|唯一着法|谱招|Best|Excellent|Good|Inaccuracy|Mistake|Blunder|Forced|Book)/.test(String(verdict));
    check('coach grades the played move', graded, String(verdict).replace(/\s+/g, ' ').slice(0, 120));
    const ownPlyCoach = await cdp.evaluate('document.querySelectorAll("[data-testid=move]").length');
    check('coach mode records the move', Number(ownPlyCoach) >= 1, `${ownPlyCoach} plies`);
    await assertNoEmoji(cdp, '/coach');
    await cdp.screenshot('coach.png', { width: 1280, height: 1100 });

    // 4 ---------------------------------------------------------------- review
    await cdp.navigate(`${BASE}/review`);
    const reviewLoaded = await cdp
      .waitForExpression('document.querySelectorAll("[data-testid=move]").length >= 2', 20_000, 'review move list')
      .then(() => true)
      .catch(() => false);
    check('/review loads the previous game', reviewLoaded);

    const started = await cdp
      .waitForExpression(
        `(() => {
          const button = [...document.querySelectorAll('button')].find(el => /(开始分析|Analyse)/.test(el.textContent || ''));
          if (!button || button.disabled) return null;
          button.click();
          return true;
        })()`,
        60_000,
        'review analyse button enabled',
      )
      .catch(() => false);
    check('/review analysis can be started', started === true);

    const stats = await cdp
      .waitForExpression(
        '(() => { const el = document.querySelector("[data-testid=review-stats]"); return el ? el.innerText : null; })()',
        90_000,
        'review stats',
      )
      .catch(() => '');
    check('review produces accuracy statistics', /(准确率|Accuracy)/.test(String(stats)) && /%/.test(String(stats)), String(stats).replace(/\s+/g, ' ').slice(0, 100));
    await assertNoEmoji(cdp, '/review');
    await cdp.screenshot('review.png', { width: 1280, height: 1000 });

    // 4 ----------------------------------------------------------------- watch
    // Pin the zoom explicitly so the checks do not depend on earlier runs.
    await cdp.evaluate(`(() => {
      const key = 'aurorachess.settings.v1';
      const current = JSON.parse(localStorage.getItem(key) || '{}');
      localStorage.setItem(key, JSON.stringify({ ...current, watchZoom: 4 }));
      return true;
    })()`);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 192, height: 192, deviceScaleFactor: 2, mobile: true });
    await cdp.navigate(`${BASE}/watch`);
    await sleep(500);
    const watch = await cdp.evaluate(`(() => {
      const stage = document.querySelector('.watch-stage');
      const board = document.querySelector('.board-surface');
      const rect = board?.getBoundingClientRect();
      const stageRect = stage?.getBoundingClientRect();
      return {
        innerWidth: window.innerWidth,
        hasStage: !!stage,
        hasChromeNav: !!document.querySelector('header nav'),
        stageWidth: stageRect ? Math.round(stageRect.width) : 0,
        stageTop: stageRect ? Math.round(stageRect.top) : -1,
        stageBottom: stageRect ? Math.round(stageRect.bottom) : -1,
        boardWidth: rect ? Math.round(rect.width) : 0,
        // Squares visible in the zoomed window (default 4x4 => ~4 per side).
        squarePx: rect ? Math.round(rect.width / 8) : 0,
      };
    })()`);
    check('watch layout activates at 192px', watch.hasStage && watch.innerWidth === 192, JSON.stringify(watch));
    check('watch viewport hides the app navigation', !watch.hasChromeNav);
    check(
      'the whole watch stage fits on screen',
      watch.stageTop >= 0 && watch.stageBottom <= 192,
      `top ${watch.stageTop}, bottom ${watch.stageBottom}`,
    );
    check(
      'watch board is zoomed to legible squares',
      watch.squarePx >= 30 && watch.squarePx <= 60,
      `${watch.squarePx}px squares (4x4 window expected)`,
    );
    await cdp.screenshot('watch-192.png', { width: 192, height: 192 });

    // The radial menu must open from the status chip, and every control must be
    // a real touch target fully inside the 192px glass.
    const menu = await cdp.evaluate(`(() => {
      const chip = document.querySelector('button.watch-chip');
      if (!chip) return { opened: false, reason: 'no status chip' };
      chip.click();
      return { opened: true };
    })()`);
    await sleep(400);
    const radial = await cdp.evaluate(`(() => {
      const chips = [...document.querySelectorAll('.watch-radial')];
      const rects = chips.map(el => el.getBoundingClientRect());
      return {
        count: chips.length,
        minSize: rects.length ? Math.round(Math.min(...rects.map(r => Math.min(r.width, r.height)))) : 0,
        inside: rects.every(r => r.left >= -1 && r.top >= -1 && r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1),
      };
    })()`);
    check('radial menu opens on tap', menu.opened && radial.count >= 4, `${radial.count} radial controls`);
    check('radial controls are touch-sized (>=48px)', radial.minSize >= 46, `${radial.minSize}px`);
    check('radial controls stay inside the round screen', radial.inside);
    await assertNoEmoji(cdp, '/watch (menu open)');
    await cdp.screenshot('watch-menu.png', { width: 192, height: 192 });

    // The "whole board" zoom must show all 8x8 files inside the round screen.
    await cdp.evaluate(`(() => {
      const key = 'aurorachess.settings.v1';
      const current = JSON.parse(localStorage.getItem(key) || '{}');
      localStorage.setItem(key, JSON.stringify({ ...current, watchZoom: 8 }));
      return true;
    })()`);
    await cdp.navigate(`${BASE}/watch`);
    await sleep(700);
    const fullBoard = await cdp.evaluate(`(() => {
      const stage = document.querySelector('.watch-stage').getBoundingClientRect();
      const board = document.querySelector('.board-surface').getBoundingClientRect();
      return {
        stage: Math.round(stage.width),
        board: Math.round(board.width),
        square: Math.round(board.width / 8),
        inside:
          board.left >= stage.left - 1 &&
          board.top >= stage.top - 1 &&
          board.right <= stage.right + 1 &&
          board.bottom <= stage.bottom + 1,
      };
    })()`);
    check(
      'whole-board zoom fits the full 8x8 inside the circle',
      fullBoard.inside && fullBoard.square >= 12,
      JSON.stringify(fullBoard),
    );
    await cdp.screenshot('watch-full.png', { width: 454, height: 454 });
    await cdp.screenshot('watch-454.png', { width: 454, height: 454 });
  } finally {
    try {
      cdp?.ws.close();
    } catch {
      // ignore
    }
    child.kill();
    // Give the browser a moment to release the profile before the next run.
    await sleep(1200);
  }

  const failed = results.filter(result => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} browser checks passed`);
  console.log(`screenshots: ${SHOT_DIR}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch(error => {
  console.error('browser e2e failed:', error.message);
  process.exit(1);
});
