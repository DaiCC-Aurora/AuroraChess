import { describe, expect, it } from 'vitest';
import { AuroraGame, IllegalMoveError } from './game';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('AuroraGame', () => {
  it('starts from the initial position with 20 legal moves', () => {
    const game = new AuroraGame();
    expect(game.fen).toBe(START);
    expect(game.turn).toBe('w');
    expect(game.legalMoveList()).toHaveLength(20);
    expect(game.phase()).toBe('opening');
  });

  it('records the FEN before and after every move', () => {
    const game = new AuroraGame();
    const move = game.move({ from: 'e2', to: 'e4' });
    expect(move.san).toBe('e4');
    expect(move.before).toBe(START);
    expect(move.after).toBe(game.fen);
    expect(move.ply).toBe(0);
    expect(move.moveNumber).toBe(1);
    expect(move.isCapture).toBe(false);
  });

  it('rejects illegal moves without corrupting the game', () => {
    const game = new AuroraGame();
    expect(game.tryMove({ from: 'e2', to: 'e5' })).toEqual({ ok: false, reason: 'no-legal-move' });
    expect(() => game.move({ from: 'e2', to: 'e5' })).toThrow(IllegalMoveError);
    expect(game.fen).toBe(START);
  });

  it('requires a promotion piece', () => {
    const game = new AuroraGame('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    expect(game.needsPromotion('a7', 'a8')).toBe(true);
    expect(game.tryMove({ from: 'a7', to: 'a8' })).toEqual({ ok: false, reason: 'promotion-required' });
    const promoted = game.move({ from: 'a7', to: 'a8', promotion: 'q' });
    expect(promoted.san).toBe('a8=Q+');
    expect(promoted.promotion).toBe('q');
    expect(game.status().over).toBe(false);
  });

  it('detects checkmate (fool’s mate) with the right result', () => {
    const game = AuroraGame.fromMoves(['f3', 'e5', 'g4', 'Qh4#']);
    const status = game.status();
    expect(status.over).toBe(true);
    expect(status.reason).toBe('checkmate');
    expect(status.winner).toBe('b');
    expect(status.score).toBe('0-1');
    expect(game.moves[3].checkmate).toBe(true);
  });

  it('detects stalemate as a draw', () => {
    const game = new AuroraGame('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    const status = game.status();
    expect(status.over).toBe(true);
    expect(status.reason).toBe('stalemate');
    expect(status.winner).toBeNull();
    expect(status.score).toBe('1/2-1/2');
  });

  it('detects insufficient material', () => {
    const game = new AuroraGame('8/8/8/4k3/8/8/8/4K3 w - - 0 1');
    expect(game.status().reason).toBe('insufficient-material');
  });

  it('detects threefold repetition', () => {
    const game = AuroraGame.fromMoves(['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']);
    expect(game.status().reason).toBe('threefold-repetition');
  });

  it('supports resignation through an explicit override', () => {
    const game = new AuroraGame();
    game.endGame('resign', 'b');
    expect(game.status()).toEqual({ over: true, winner: 'b', reason: 'resign', score: '0-1' });
    // Any new move clears the override.
    game.undo();
    expect(game.status().over).toBe(false);
  });

  it('round-trips through PGN', () => {
    const game = AuroraGame.fromMoves(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
    const pgn = game.pgn({ White: 'A', Black: 'B' });
    const reloaded = AuroraGame.fromPgn(pgn);
    expect(reloaded.fen).toBe(game.fen);
    expect(reloaded.moves.map(m => m.san)).toEqual(game.moves.map(m => m.san));
    expect(pgn).toContain('[White "A"]');
  });

  it('builds a UCI position command that keeps the move history', () => {
    const game = AuroraGame.fromMoves(['e4', 'e5', 'Nf3']);
    expect(game.uciPositionCommand()).toBe('position startpos moves e2e4 e7e5 g1f3');
  });

  it('uses position fen when the game did not start from the initial position', () => {
    const game = new AuroraGame('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    expect(game.uciPositionCommand()).toBe('position fen 4k3/8/8/8/8/8/8/4K3 w - - 0 1');
  });

  it('undoes back to the previous position', () => {
    const game = AuroraGame.fromMoves(['e4', 'e5']);
    const undone = game.undo();
    expect(undone?.san).toBe('e5');
    expect(game.turn).toBe('b');
    expect(game.uciHistory()).toEqual(['e2e4']);
  });

  it('exposes legal targets and the king square', () => {
    const game = new AuroraGame();
    const targets = game.legalTargets('e2');
    expect(targets.map(t => t.to)).toEqual(['e3', 'e4']);
    expect(game.kingSquare('w')).toBe('e1');
    expect(game.kingSquare('b')).toBe('e8');
  });

  it('clones without sharing state', () => {
    const game = AuroraGame.fromMoves(['e4']);
    const clone = game.clone();
    clone.move({ from: 'e7', to: 'e5' });
    expect(game.plyCount).toBe(1);
    expect(clone.plyCount).toBe(2);
  });
});
