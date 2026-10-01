import { describe, expect, it } from 'vitest';
import {
  ENGINE_ELO_MAX,
  ENGINE_ELO_MIN,
  capLevelForWatch,
  levelForElo,
  levelToUciOptions,
  selectMove,
  shouldUseBook,
  type MoveCandidate,
} from './levels';
import { parseOptionLine, type UciOption } from './uci';

const options = (lines: string[]): Map<string, UciOption> =>
  new Map(lines.map(line => parseOptionLine(line)!).map(option => [option.name, option]));

const REAL_OPTIONS = options([
  'option name UCI_LimitStrength type check default false',
  'option name UCI_Elo type spin default 1320 min 1320 max 3190',
  'option name Skill Level type spin default 20 min 0 max 20',
  'option name MultiPV type spin default 1 min 1 max 256',
  'option name Move Overhead type spin default 10 min 0 max 5000',
]);

describe('ELO -> engine configuration', () => {
  it('clamps the requested rating to the supported slider range', () => {
    expect(levelForElo(10).elo).toBe(ENGINE_ELO_MIN);
    expect(levelForElo(99_999).elo).toBe(ENGINE_ELO_MAX);
    expect(levelForElo(1587).elo).toBe(1587);
  });

  it('ramps effort monotonically with strength', () => {
    const levels = [600, 1000, 1400, 1800, 2200, 2600, 3000].map(levelForElo);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i].depth).toBeGreaterThanOrEqual(levels[i - 1].depth);
      expect(levels[i].movetimeMs).toBeGreaterThanOrEqual(levels[i - 1].movetimeMs);
      expect(levels[i].cplMean).toBeLessThanOrEqual(levels[i - 1].cplMean);
      expect(levels[i].skillLevel).toBeGreaterThanOrEqual(levels[i - 1].skillLevel);
    }
    expect(levelForElo(600).depth).toBeLessThanOrEqual(2);
    expect(levelForElo(3000).skillLevel).toBe(20);
  });

  it('only advertises UCI_Elo inside the engine window', () => {
    expect(levelForElo(800).uciElo).toBeNull();
    expect(levelForElo(1320).uciElo).toBe(1320);
    expect(levelForElo(2400).uciElo).toBe(2400);
    // Below the window the engine must not hold back via UCI_Elo.
    expect(levelForElo(800).limitStrength).toBe(true);
  });

  it('gives the selection filter more candidates at lower strength', () => {
    expect(levelForElo(700).multiPv).toBeGreaterThan(levelForElo(2500).multiPv);
    expect(levelForElo(2500).multiPv).toBe(1);
  });

  it('builds setoption lines that the engine actually advertises', () => {
    const weak = levelToUciOptions(levelForElo(900), REAL_OPTIONS);
    expect(weak).toContain('setoption name UCI_LimitStrength value false');
    expect(weak.some(line => line.startsWith('setoption name Skill Level value'))).toBe(true);
    expect(weak.some(line => line.startsWith('setoption name UCI_Elo value'))).toBe(false);

    const club = levelToUciOptions(levelForElo(1600), REAL_OPTIONS);
    expect(club).toContain('setoption name UCI_LimitStrength value true');
    expect(club).toContain('setoption name UCI_Elo value 1600');

    // Unknown options must never be sent.
    const empty = levelToUciOptions(levelForElo(1600));
    expect(empty.length).toBeGreaterThan(0);
    expect(levelToUciOptions(levelForElo(1600), options(['option name MultiPV type spin default 1 min 1 max 256']))).toEqual([
      'setoption name MultiPV value 5',
    ]);
  });

  it('caps the search budget on watches', () => {
    const capped = capLevelForWatch(levelForElo(2400));
    expect(capped.depth).toBeLessThanOrEqual(6);
    expect(capped.movetimeMs).toBeLessThanOrEqual(600);
    expect(capped.multiPv).toBeLessThanOrEqual(3);
    expect(capped.elo).toBe(2400);
  });

  it('uses the opening book only during the first plies', () => {
    const level = levelForElo(1200);
    expect(shouldUseBook(0, level)).toBe(true);
    expect(shouldUseBook(level.bookPlies, level)).toBe(false);
    expect(shouldUseBook(0, levelForElo(3000))).toBe(false);
  });
});

describe('move selection filter', () => {
  const candidates: MoveCandidate[] = [
    { move: 'g1f3', lossCp: 0 },
    { move: 'b1c3', lossCp: 40 },
    { move: 'f2f3', lossCp: 300 },
  ];
  const level = levelForElo(1200);

  it('plays the best move when the engine reports a single line', () => {
    const selection = selectMove(candidates, { ...level, multiPv: 1 }, () => 0.99);
    expect(selection.move).toBe('g1f3');
    expect(selection.deliberate).toBe(false);
  });

  it('is deterministic when the random source is pinned', () => {
    const first = selectMove(candidates, level, () => 0);
    const second = selectMove(candidates, level, () => 0);
    expect(first.move).toBe(second.move);
  });

  it('can pick a clearly inferior move for a weak level', () => {
    const weak = { ...levelForElo(600), cplMean: 300, cplStdev: 0, moveDecay: 0.9 };
    const picks = new Set<string>();
    for (let i = 0; i < 200; i++) picks.add(selectMove(candidates, weak).move);
    expect(picks.size).toBeGreaterThan(1);
    expect(picks.has('f2f3')).toBe(true);
  });

  it('almost always plays the best move for a strong level', () => {
    const strong = { ...levelForElo(2800), cplMean: 0, cplStdev: 5, moveDecay: 0.2 };
    let best = 0;
    for (let i = 0; i < 200; i++) if (selectMove(candidates, strong).move === 'g1f3') best++;
    expect(best).toBeGreaterThan(180);
  });

  it('reports a target centipawn loss', () => {
    const selection = selectMove(candidates, level, () => 0.5);
    expect(selection.targetCpl).toBeGreaterThanOrEqual(0);
  });

  it('throws when there is nothing to choose from', () => {
    expect(() => selectMove([], level)).toThrow();
  });
});
