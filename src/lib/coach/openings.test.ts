import { describe, expect, it } from 'vitest';
import { bookContinuations, isBookMove, isBookPosition, lookupOpening, openingName, OPENINGS } from './openings';

describe('opening book', () => {
  it('matches the longest known line', () => {
    expect(lookupOpening(['e4', 'c5'])?.opening.name).toBe('Sicilian Defence');
    expect(lookupOpening(['e4', 'c5'])?.plies).toBe(2);
    const najdorf = lookupOpening(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6']);
    expect(najdorf?.opening.eco).toBe('B90');
    expect(najdorf?.plies).toBe(10);
  });

  it('falls back to the shallower opening when the line diverges', () => {
    // 1.e4 a6 is not a book line, but 1.e4 alone is.
    expect(lookupOpening(['e4', 'a6'])?.opening.moves).toEqual(['e4']);
    expect(lookupOpening(['a3'])).toBeNull();
  });

  it('offers only continuations that exist in the book', () => {
    const moves = bookContinuations(['e4']);
    expect(moves).toContain('c5');
    expect(moves).toContain('e5');
    expect(moves).toContain('e6');
    expect(moves).toContain('c6');
    expect(moves).toContain('Nf6');
    expect(moves).not.toContain('a6');

    const italian = bookContinuations(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(italian).toContain('Bc4');
    expect(italian).toContain('Bb5');
  });

  it('recognises a played move as book or not', () => {
    expect(isBookMove(['e4'])).toBe(true);
    expect(isBookMove(['e4', 'c5'])).toBe(true);
    expect(isBookMove(['e4', 'a6'])).toBe(false);
    expect(isBookMove([])).toBe(false);
  });

  it('knows when a position is still in book', () => {
    expect(isBookPosition(['e4', 'e5', 'Nf3'])).toBe(true);
    expect(isBookPosition(['e4', 'h5'])).toBe(false);
  });

  it('localises the opening name', () => {
    const opening = lookupOpening(['d4', 'd5', 'c4'])!.opening;
    expect(openingName(opening, 'zh')).toBe('后翼弃兵');
    expect(openingName(opening, 'en')).toBe("Queen's Gambit");
  });

  it('keeps the book internally consistent', () => {
    const seen = new Set<string>();
    for (const opening of OPENINGS) {
      const key = opening.moves.join(' ');
      expect(seen.has(key), `duplicate book line: ${key}`).toBe(false);
      seen.add(key);
      expect(opening.moves.length).toBeGreaterThan(0);
      expect(opening.eco).toMatch(/^[A-E]\d{2}$/);
      expect(opening.name.length).toBeGreaterThan(0);
      expect(opening.nameZh.length).toBeGreaterThan(0);
    }
  });
});
