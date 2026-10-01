/**
 * Evaluation maths and move quality classification.
 *
 * The centipawn -> winning-chances sigmoid is the same one lichess uses
 * (see docs/reference/lichess-notes.md): it turns engine scores into a
 * human-meaningful probability, which is what makes an eval bar readable and
 * what makes "how bad was that move?" comparable across game phases.
 */

import type { Color, MoveQuality } from '../chess/types';
import type { EngineInfo, EngineScore } from './uci';

/** lichess' winning-chances constant: 2 / (1 + exp(-k * cp)) - 1. */
export const WIN_PROB_CONSTANT = 0.00368208;

/** Anything beyond this is "completely winning" for display purposes. */
export const MAX_DISPLAY_CP = 1500;

/**
 * Winning chances saturate, so centipawns are clamped before the sigmoid
 * (lichess clamps at +/-1000).
 */
export const WIN_PROB_CP_CLAMP = 1000;

/** Mate in N is mapped to (21 - N) * 100 cp, following lichess. */
export const MATE_CP_FACTOR = 100;
export const MATE_CP_MAX_MOVES = 10;
export const MATE_CP_BASE = 21;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Converts a UCI score (relative to the side to move) into centipawns. */
export function scoreToCp(score: EngineScore | undefined): number {
  if (!score) return 0;
  if (score.type === 'mate') {
    // Mate in N is "better" the smaller N is; the sign carries the direction.
    const magnitude = (MATE_CP_BASE - Math.min(Math.abs(score.value), MATE_CP_MAX_MOVES)) * MATE_CP_FACTOR;
    return score.value >= 0 ? magnitude : -magnitude;
  }
  return score.value;
}

export function isMateScore(score: EngineScore | undefined): boolean {
  return score?.type === 'mate';
}

/**
 * Winning chances in [0, 1] for the side the centipawn score belongs to.
 * 0.5 == equal, 1 == winning, 0 == lost.
 */
export function winProbability(cp: number): number {
  return 2 / (1 + Math.exp(-WIN_PROB_CONSTANT * clamp(cp, -WIN_PROB_CP_CLAMP, WIN_PROB_CP_CLAMP))) - 1;
}

/** Winning chances as a 0..100 percentage, the form used in the UI. */
export function winPercent(cp: number): number {
  return 50 + 50 * winProbability(cp);
}

/** Converts a side-to-move score into a white-relative score. */
export function toWhiteCp(cp: number, turn: Color): number {
  return turn === 'w' ? cp : -cp;
}

export function whiteWinProbability(whiteCp: number): number {
  return winProbability(whiteCp);
}

/** Eval bar fill for white, in percent (0..100). */
export function evalBarPercent(whiteCp: number): number {
  return clamp(winProbability(whiteCp) * 100, 2, 98);
}

/**
 * Human readable evaluation from `pov`'s point of view:
 * `+1.35`, `-0.42`, `#3` (mate in 3 for us), `#-2`, `0.00`.
 */
export function formatEval(score: EngineScore | undefined, pov: Color = 'w', turn: Color = 'w'): string {
  if (!score) return '–';
  if (score.type === 'mate') {
    // UCI mate values are relative to the side to move.
    const mateForPov = turn === pov ? score.value : -score.value;
    if (mateForPov === 0) return '#';
    return mateForPov > 0 ? `#${mateForPov}` : `#-${Math.abs(mateForPov)}`;
  }
  const cp = turn === pov ? score.value : -score.value;
  const pawns = cp / 100;
  if (Math.abs(pawns) < 0.005) return '0.00';
  return `${pawns > 0 ? '+' : '-'}${Math.abs(pawns).toFixed(2)}`;
}

export function formatPawns(cp: number): string {
  return `${cp >= 0 ? '+' : '-'}${Math.abs(cp / 100).toFixed(2)}`;
}

export interface QualityMeta {
  key: MoveQuality;
  /** i18n key suffix: `quality.blunder`. */
  i18n: string;
  symbol: string;
  color: string;
  /** Higher is better; used for accuracy scoring. */
  weight: number;
}

/**
 * Colours for inaccuracy/mistake/blunder are lichess' verified values
 * (hsl 202 78% 62% / 41 100% 45% / 0 69% 60%) so players recognise them.
 */
export const QUALITY_META: Record<MoveQuality, QualityMeta> = {
  book: { key: 'book', i18n: 'quality.book', symbol: '📖', color: '#8a8f98', weight: 1 },
  best: { key: 'best', i18n: 'quality.best', symbol: '★', color: '#38bdf8', weight: 1 },
  excellent: { key: 'excellent', i18n: 'quality.excellent', symbol: '!', color: '#4ade80', weight: 0.95 },
  good: { key: 'good', i18n: 'quality.good', symbol: '✓', color: '#a3e635', weight: 0.85 },
  forced: { key: 'forced', i18n: 'quality.forced', symbol: '⇉', color: '#94a3b8', weight: 0.9 },
  inaccuracy: { key: 'inaccuracy', i18n: 'quality.inaccuracy', symbol: '?!', color: 'hsl(202 78% 62%)', weight: 0.6 },
  mistake: { key: 'mistake', i18n: 'quality.mistake', symbol: '?', color: 'hsl(41 100% 45%)', weight: 0.35 },
  blunder: { key: 'blunder', i18n: 'quality.blunder', symbol: '??', color: 'hsl(0 69% 60%)', weight: 0 },
};

/** Move quality thresholds in centipawn loss (capped at MAX_DISPLAY_CP). */
export const CP_THRESHOLDS = {
  excellent: 10,
  good: 50,
  inaccuracy: 100,
  mistake: 250,
} as const;

/** Winning-chance drop thresholds — lichess' server-side values, used as-is. */
export const WIN_PROB_THRESHOLDS = {
  inaccuracy: 0.1,
  mistake: 0.2,
  blunder: 0.3,
} as const;

const QUALITY_SEVERITY: MoveQuality[] = ['best', 'excellent', 'good', 'forced', 'inaccuracy', 'mistake', 'blunder'];

function worseOf(a: MoveQuality, b: MoveQuality): MoveQuality {
  const rank = (q: MoveQuality) => {
    const i = QUALITY_SEVERITY.indexOf(q);
    return i < 0 ? 0 : i;
  };
  return rank(a) >= rank(b) ? a : b;
}

export interface ClassificationInput {
  /** Centipawn loss of the played move compared to the engine's best move. */
  lossCp: number;
  /** Winning chances (0..1) for the mover before the move. */
  winBefore: number;
  /** Winning chances (0..1) for the mover after the move. */
  winAfter: number;
  /** The played move is literally the engine's first choice. */
  isBestMove: boolean;
  /** Only one legal move was available. */
  onlyMove?: boolean;
  /** The move follows a known opening line. */
  isBook?: boolean;
}

/**
 * Classifies a move the way a human coach would: a combination of how much
 * evaluation was lost and how much winning probability was thrown away.
 */
export function classifyMove(input: ClassificationInput): MoveQuality {
  const { lossCp, winBefore, winAfter, isBestMove, onlyMove, isBook } = input;
  if (isBook) return 'book';
  if (onlyMove) return 'forced';
  if (isBestMove || lossCp <= 0) return 'best';

  const loss = clamp(lossCp, 0, MAX_DISPLAY_CP);
  const winDrop = clamp(winBefore - winAfter, 0, 1);

  let byCp: MoveQuality = 'blunder';
  if (loss <= CP_THRESHOLDS.excellent) byCp = 'excellent';
  else if (loss <= CP_THRESHOLDS.good) byCp = 'good';
  else if (loss <= CP_THRESHOLDS.inaccuracy) byCp = 'inaccuracy';
  else if (loss <= CP_THRESHOLDS.mistake) byCp = 'mistake';

  let byWin: MoveQuality = 'excellent';
  if (winDrop >= WIN_PROB_THRESHOLDS.blunder) byWin = 'blunder';
  else if (winDrop >= WIN_PROB_THRESHOLDS.mistake) byWin = 'mistake';
  else if (winDrop >= WIN_PROB_THRESHOLDS.inaccuracy) byWin = 'inaccuracy';
  else if (winDrop > 0.02) byWin = 'good';

  return worseOf(byCp, byWin);
}

export function isBadQuality(q: MoveQuality): boolean {
  return q === 'inaccuracy' || q === 'mistake' || q === 'blunder';
}

/**
 * Accuracy percentage for a set of judgements (0..100), weighted so that
 * blunders hurt much more than small inaccuracies.
 */
export function accuracyFromQualities(qualities: MoveQuality[]): number {
  const scored = qualities.filter(q => q !== 'book' && q !== 'forced');
  if (!scored.length) return 100;
  const total = scored.reduce((sum, q) => sum + QUALITY_META[q].weight, 0);
  return Math.round((total / scored.length) * 1000) / 10;
}

/** Best (final) MultiPV line at the deepest reached depth. */
export function pickBestInfo(infos: EngineInfo[]): EngineInfo | null {
  const withScore = infos.filter(i => i.score);
  if (!withScore.length) return null;
  return withScore.reduce((best, cur) => {
    if (cur.depth !== best.depth) return cur.depth > best.depth ? cur : best;
    return cur.multipv < best.multipv ? cur : best;
  });
}

/** Groups MultiPV lines by index, keeping the deepest entry for each. */
export function groupByMultiPv(infos: EngineInfo[]): EngineInfo[] {
  const byIndex = new Map<number, EngineInfo>();
  for (const info of infos) {
    const prev = byIndex.get(info.multipv);
    if (!prev || info.depth >= prev.depth) byIndex.set(info.multipv, info);
  }
  return [...byIndex.values()].sort((a, b) => a.multipv - b.multipv);
}
