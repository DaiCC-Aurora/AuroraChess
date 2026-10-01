import { describe, expect, it } from 'vitest';
import { AuroraGame } from '../chess/game';
import { formatMoves, lanToSan, pvToSan } from './pv';

describe('principal variation rendering', () => {
  it('converts a UCI variation into SAN', () => {
    const game = new AuroraGame();
    expect(pvToSan(game, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'])).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
  });

  it('stops at the first move that does not fit', () => {
    const game = new AuroraGame();
    expect(pvToSan(game, ['e2e4', 'e7e5', 'e2e4'])).toEqual(['e4', 'e5']);
  });

  it('respects the limit', () => {
    const game = new AuroraGame();
    expect(pvToSan(game, ['e2e4', 'e7e5', 'g1f3'], 2)).toEqual(['e4', 'e5']);
  });

  it('converts a single move', () => {
    const game = AuroraGame.fromMoves(['e4', 'e5']);
    expect(lanToSan(game, 'g1f3')).toBe('Nf3');
    expect(lanToSan(game, 'a1a8')).toBeNull();
  });

  it('formats a move list for display', () => {
    const game = AuroraGame.fromMoves(['e4', 'e5', 'Nf3']);
    expect(formatMoves(game.moves)).toBe('1.e4 e5 2.Nf3');
  });
});
