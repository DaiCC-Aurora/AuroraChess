import { describe, expect, it } from 'vitest';
import {
  accuracyFromQualities,
  classifyMove,
  evalBarPercent,
  formatEval,
  groupByMultiPv,
  MAX_DISPLAY_CP,
  scoreToCp,
  winPercent,
  winProbability,
} from './analysis';
import type { EngineInfo } from './uci';

describe('evaluation maths', () => {
  it('uses the lichess winning-chances sigmoid', () => {
    expect(winProbability(0)).toBeCloseTo(0, 10);
    // 1000cp (the clamp) is a large but not absolute advantage: ~0.951.
    expect(winProbability(1000)).toBeCloseTo(0.9509, 4);
    expect(winProbability(-1000)).toBeCloseTo(-0.9509, 4);
    // Symmetric around equality.
    expect(winProbability(120)).toBeCloseTo(-winProbability(-120), 10);
    // Saturated scores are clamped, so extreme values cannot exceed 1.
    expect(winProbability(50_000)).toBeLessThanOrEqual(1);
  });

  it('converts winning chances to a percentage', () => {
    expect(winPercent(0)).toBeCloseTo(50, 6);
    expect(winPercent(300)).toBeGreaterThan(50);
    // An equal position is half of the bar, not an empty one.
    expect(evalBarPercent(0)).toBeCloseTo(50, 6);
    expect(evalBarPercent(99_999)).toBeLessThanOrEqual(98);
    expect(evalBarPercent(-99_999)).toBeGreaterThanOrEqual(2);
  });

  it('maps mate scores into ordered centipawns', () => {
    expect(scoreToCp({ type: 'mate', value: 3 })).toBe(1800);
    expect(scoreToCp({ type: 'mate', value: -1 })).toBe(-2000);
    expect(scoreToCp({ type: 'mate', value: 42 })).toBe(1100);
    expect(scoreToCp({ type: 'cp', value: 35 })).toBe(35);
    expect(scoreToCp(undefined)).toBe(0);
  });

  it('formats evaluations from either point of view', () => {
    expect(formatEval({ type: 'cp', value: 135 }, 'w', 'w')).toBe('+1.35');
    expect(formatEval({ type: 'cp', value: -42 }, 'w', 'w')).toBe('-0.42');
    expect(formatEval({ type: 'cp', value: 42 }, 'b', 'w')).toBe('-0.42');
    expect(formatEval({ type: 'mate', value: 3 }, 'w', 'w')).toBe('#3');
    expect(formatEval({ type: 'mate', value: 3 }, 'b', 'w')).toBe('#-3');
    expect(formatEval(undefined)).toBe('–');
  });
});

describe('move classification', () => {
  const base = { winBefore: 0.5, winAfter: 0.5, isBestMove: false };

  it('marks the engine’s own choice as best', () => {
    expect(classifyMove({ ...base, lossCp: 0, isBestMove: true })).toBe('best');
  });

  it('grades by centipawn loss', () => {
    expect(classifyMove({ ...base, lossCp: 5 })).toBe('excellent');
    expect(classifyMove({ ...base, lossCp: 30 })).toBe('good');
    expect(classifyMove({ ...base, lossCp: 80 })).toBe('inaccuracy');
    expect(classifyMove({ ...base, lossCp: 200 })).toBe('mistake');
    expect(classifyMove({ ...base, lossCp: 600 })).toBe('blunder');
    expect(classifyMove({ ...base, lossCp: MAX_DISPLAY_CP * 10 })).toBe('blunder');
  });

  it('respects forced moves and book moves', () => {
    expect(classifyMove({ ...base, lossCp: 800, onlyMove: true })).toBe('forced');
    expect(classifyMove({ ...base, lossCp: 800, isBook: true })).toBe('book');
  });

  it('escalates when winning chances collapse, even if centipawns look small', () => {
    // A move that turns a winning position into a lost one is a blunder
    // regardless of the raw centipawn delta.
    expect(classifyMove({ ...base, lossCp: 20, winBefore: 0.95, winAfter: 0.4 })).toBe('blunder');
    expect(classifyMove({ ...base, lossCp: 20, winBefore: 0.95, winAfter: 0.7 })).toBe('mistake');
    expect(classifyMove({ ...base, lossCp: 20, winBefore: 0.95, winAfter: 0.82 })).toBe('inaccuracy');
  });

  it('computes accuracy weighted towards blunders', () => {
    expect(accuracyFromQualities(['best', 'best'])).toBe(100);
    expect(accuracyFromQualities([])).toBe(100);
    const mixed = accuracyFromQualities(['best', 'blunder']);
    expect(mixed).toBe(50);
    expect(accuracyFromQualities(['book', 'forced'])).toBe(100);
  });
});

describe('MultiPV handling', () => {
  const info = (multipv: number, depth: number, cp: number): EngineInfo => ({
    depth,
    multipv,
    pv: ['e2e4'],
    score: { type: 'cp', value: cp },
  });

  it('keeps the deepest line per MultiPV index, ordered', () => {
    const grouped = groupByMultiPv([info(1, 10, 10), info(2, 8, -20), info(1, 12, 15), info(2, 11, -30), info(3, 5, -80)]);
    expect(grouped.map(g => [g.multipv, g.depth, g.score?.value])).toEqual([
      [1, 12, 15],
      [2, 11, -30],
      [3, 5, -80],
    ]);
  });
});
