/**
 * Engine strength -> UCI configuration + move selection policy.
 *
 * Stockfish exposes three knobs that matter for playing humans:
 *   - `UCI_LimitStrength` + `UCI_Elo` (1320..3190 in SF 16+): the engine
 *     deliberately weakens itself, this is the honest way to hit a target ELO.
 *   - `Skill Level` (0..20): older mechanism, still useful below the ELO floor.
 *   - search budget (`depth`, `movetime`): below ~1200 ELO the search budget has
 *     to be cut as well, otherwise even a "weak" engine never hangs a piece.
 *
 * On top of the UCI knobs we reproduce the move-selection model lichess uses
 * for its bots (see docs/reference/lichess-notes.md): instead of playing the
 * engine's first choice, the engine returns several MultiPV candidates and we
 * pick one with a `cplTarget` filter (aim for a *target* centipawn loss rather
 * than always the smallest) plus a `moveDecay` weighted random choice. That is
 * what makes a weak opponent feel like a human rather than a broken engine.
 */

import type { UciOption } from './uci';

export const ENGINE_ELO_MIN = 600;
export const ENGINE_ELO_MAX = 3000;
export const ENGINE_ELO_DEFAULT = 1400;

/** Stockfish's own UCI_Elo support window (see `levels.test.ts`). */
export const UCI_ELO_SUPPORTED_MIN = 1320;
export const UCI_ELO_SUPPORTED_MAX = 3190;

/** Defaults from lichess' `cplTarget` filter. */
export const CPL_FILTER_SHARPNESS = 0.06;
export const CPL_FILTER_WIDTH = 80;

export type EngineBand = 'beginner' | 'casual' | 'club' | 'strong' | 'master' | 'maximum';

export interface EngineLevel {
  /** Advertised playing strength. */
  elo: number;
  band: EngineBand;
  skillLevel: number;
  limitStrength: boolean;
  /** `null` when the engine's UCI_Elo window cannot express this strength. */
  uciElo: number | null;
  depth: number;
  movetimeMs: number;
  multiPv: number;
  /** Mean centipawn loss the selection filter aims for. */
  cplMean: number;
  /** Spread of the target centipawn loss (gaussian sigma). */
  cplStdev: number;
  /** Weight decay for the ranked candidate pick; low = deterministic. */
  moveDecay: number;
  /** Opening book plies played instantly before the engine takes over. */
  bookPlies: number;
}

type Anchor = readonly [elo: number, value: number];

/** Piecewise-linear ramp, clamped at both ends. */
function ramp(anchors: readonly Anchor[], elo: number): number {
  if (elo <= anchors[0][0]) return anchors[0][1];
  const last = anchors[anchors.length - 1];
  if (elo >= last[0]) return last[1];
  for (let i = 1; i < anchors.length; i++) {
    const [x1, y1] = anchors[i - 1];
    const [x2, y2] = anchors[i];
    if (elo <= x2) {
      const t = (elo - x1) / (x2 - x1);
      return y1 + t * (y2 - y1);
    }
  }
  return last[1];
}

const DEPTH_ANCHORS: readonly Anchor[] = [
  [600, 1],
  [800, 2],
  [1000, 3],
  [1200, 4],
  [1400, 6],
  [1600, 8],
  [1800, 10],
  [2000, 12],
  [2200, 15],
  [2400, 18],
  [2600, 22],
  [2800, 26],
  [3000, 30],
];

const MOVETIME_ANCHORS: readonly Anchor[] = [
  [600, 200],
  [800, 250],
  [1000, 300],
  [1200, 400],
  [1400, 500],
  [1600, 650],
  [1800, 800],
  [2000, 1000],
  [2200, 1200],
  [2400, 1500],
  [2600, 1800],
  [2800, 2200],
  [3000, 2500],
];

const CPL_MEAN_ANCHORS: readonly Anchor[] = [
  [600, 220],
  [800, 160],
  [1000, 115],
  [1200, 85],
  [1400, 58],
  [1600, 42],
  [1800, 30],
  [2000, 22],
  [2200, 15],
  [2400, 10],
  [2600, 6],
  [3000, 3],
];

const CPL_STDEV_ANCHORS: readonly Anchor[] = [
  [600, 110],
  [1000, 90],
  [1400, 80],
  [1800, 60],
  [2200, 45],
  [2600, 30],
  [3000, 20],
];

const MOVE_DECAY_ANCHORS: readonly Anchor[] = [
  [600, 0.3],
  [1000, 0.4],
  [1400, 0.55],
  [1800, 0.65],
  [2200, 0.75],
  [2600, 0.85],
  [3000, 0.5],
];

const BOOK_ANCHORS: readonly Anchor[] = [
  [600, 4],
  [1200, 6],
  [1800, 4],
  [2400, 2],
  [3000, 0],
];

/** MultiPV gives the selection filter something to choose from. */
function multiPvForElo(elo: number): number {
  if (elo <= 1000) return 6;
  if (elo <= 1400) return 5;
  if (elo <= 1800) return 3;
  return 1;
}

export function bandForElo(elo: number): EngineBand {
  if (elo < 900) return 'beginner';
  if (elo < 1300) return 'casual';
  if (elo < 1700) return 'club';
  if (elo < 2100) return 'strong';
  if (elo < 2500) return 'master';
  return 'maximum';
}

export function clampElo(elo: number): number {
  return Math.min(ENGINE_ELO_MAX, Math.max(ENGINE_ELO_MIN, Math.round(elo)));
}

export function levelForElo(rawElo: number): EngineLevel {
  const elo = clampElo(rawElo);
  const useUciElo = elo >= UCI_ELO_SUPPORTED_MIN && elo <= UCI_ELO_SUPPORTED_MAX;
  return {
    elo,
    band: bandForElo(elo),
    skillLevel: Math.max(0, Math.min(20, Math.round(ramp([[600, 0], [2600, 20]], elo)))),
    // Above ~2800 the engine should stop holding back entirely.
    limitStrength: elo < 2800,
    uciElo: useUciElo ? elo : null,
    depth: Math.round(ramp(DEPTH_ANCHORS, elo)),
    movetimeMs: Math.round(ramp(MOVETIME_ANCHORS, elo)),
    multiPv: multiPvForElo(elo),
    cplMean: Math.round(ramp(CPL_MEAN_ANCHORS, elo)),
    cplStdev: Math.round(ramp(CPL_STDEV_ANCHORS, elo)),
    moveDecay: ramp(MOVE_DECAY_ANCHORS, elo),
    bookPlies: Math.round(ramp(BOOK_ANCHORS, elo)),
  };
}

export const PRESET_ELOS = [800, 1200, 1600, 2000, 2400, 2800] as const;

/**
 * Watch browsers get a fraction of a phone's thermal/battery budget, so the
 * whole search is capped regardless of the requested level (see
 * docs/reference/watch-ui-notes.md).
 */
export function capLevelForWatch(level: EngineLevel): EngineLevel {
  return {
    ...level,
    depth: Math.min(level.depth, 6),
    movetimeMs: Math.min(level.movetimeMs, 600),
    multiPv: Math.min(level.multiPv, 3),
  };
}

/**
 * Builds the `setoption` sequence for a level, honouring what the engine
 * actually reports in its `uci` handshake (never send an unknown option).
 */
export function levelToUciOptions(level: EngineLevel, supported: Map<string, UciOption> = new Map()): string[] {
  const lines: string[] = [];
  const has = (name: string) => supported.size === 0 || supported.has(name);
  const range = supported.get('UCI_Elo');

  const canUseElo =
    has('UCI_LimitStrength') &&
    has('UCI_Elo') &&
    level.uciElo !== null &&
    (!range || ((range.min === undefined || level.uciElo >= range.min) && (range.max === undefined || level.uciElo <= range.max)));

  if (has('UCI_LimitStrength')) {
    // Only keep strength limitation on when we can express the target.
    lines.push(`setoption name UCI_LimitStrength value ${canUseElo && level.limitStrength ? 'true' : 'false'}`);
  }
  if (canUseElo && level.uciElo !== null) {
    lines.push(`setoption name UCI_Elo value ${level.uciElo}`);
  }
  if (has('Skill Level')) lines.push(`setoption name Skill Level value ${level.skillLevel}`);
  if (has('MultiPV')) lines.push(`setoption name MultiPV value ${level.multiPv}`);
  if (has('Move Overhead')) lines.push('setoption name Move Overhead value 50');
  if (has('UCI_ShowWDL')) lines.push('setoption name UCI_ShowWDL value true');
  return lines;
}

export interface MoveCandidate {
  /** UCI move string, e.g. `e2e4` / `e7e8q`. */
  move: string;
  /** Centipawn loss versus the best candidate (0 for the best line). */
  lossCp: number;
}

export interface MoveSelection {
  move: string;
  /** True when the pick was deliberately below the engine's first choice. */
  deliberate: boolean;
  /** The target centipawn loss the filter was aiming for. */
  targetCpl: number;
  /** Weight of the chosen candidate (useful for debugging/telemetry). */
  weight: number;
}

/** Box-Muller gaussian, so the target CPL spread is realistic. */
function gaussian(random: () => number): number {
  const u = Math.max(random(), Number.EPSILON);
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * lichess' `cplTarget` weight: how attractive a candidate is given the target
 * centipawn loss. Candidates near the target are favoured; the sigmoid keeps
 * close-but-not-exact moves in play.
 */
export function cplWeight(lossCp: number, targetCpl: number): number {
  return 1 / (1 + Math.exp(CPL_FILTER_SHARPNESS * (Math.abs(lossCp - targetCpl) - CPL_FILTER_WIDTH)));
}

/**
 * Picks the move to actually play.
 *
 * 1. `cplTarget`: draw a target centipawn loss from N(mean, stdev) and weight
 *    every candidate by how close it is to that target.
 * 2. `moveDecay`: sort by weight and pick with probability `decay^i`, so the
 *    highest weighted move usually wins but upsets stay possible.
 *
 * At full strength (a single MultiPV line) this degenerates to the best move.
 */
export function selectMove(
  candidates: MoveCandidate[],
  level: EngineLevel,
  random: () => number = Math.random,
): MoveSelection {
  const best = candidates[0];
  if (!best) throw new Error('selectMove requires at least one candidate');

  const targetCpl = Math.abs(level.cplMean + level.cplStdev * gaussian(random));
  if (candidates.length === 1 || level.multiPv === 1) {
    return { move: best.move, deliberate: false, targetCpl, weight: 1 };
  }

  const weighted = candidates
    .map(c => ({ ...c, weight: cplWeight(c.lossCp, targetCpl) }))
    .sort((a, b) => b.weight - a.weight);

  // `decay^i` over the ranked list.
  const decay = Math.min(0.98, Math.max(0.05, level.moveDecay));
  const weights = weighted.map((_, i) => Math.pow(decay, i));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = random() * total;
  for (let i = 0; i < weighted.length; i++) {
    roll -= weights[i];
    if (roll <= 0) {
      return {
        move: weighted[i].move,
        deliberate: weighted[i].move !== best.move,
        targetCpl,
        weight: weighted[i].weight,
      };
    }
  }
  const fallback = weighted[weighted.length - 1];
  return { move: fallback.move, deliberate: fallback.move !== best.move, targetCpl, weight: fallback.weight };
}

/** Opening book is separate from strength: it keeps weak levels coherent. */
export function shouldUseBook(ply: number, level: EngineLevel): boolean {
  return ply < level.bookPlies;
}
