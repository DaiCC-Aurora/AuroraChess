import { describe, expect, it } from 'vitest';
import { AuroraGame } from '../chess/game';
import {
  bestFreeCapture,
  analysePosition,
  mateInOne,
  opponentThreats,
} from './findings';
import {
  canCapture,
  defendsSquare,
  forkMoves,
  freeCaptures,
  hangingPieces,
  kingSafety,
  pawnStructure,
  pinnedPieces,
  undevelopedCount,
  withSideToMove,
} from './probe';

/** Undefended white queen on e5, attacked by the black pawn on d6. */
const HANGING_QUEEN = '4k3/8/3p4/4Q3/8/8/8/4K3 b - - 0 1';
/** White knight can jump to d5, forking the black king (e7) and rook (c7). */
const FORK = '8/2r1k3/8/8/8/2N5/8/4K3 w - - 0 1';
/** White knight on e2 shields the king from the rook on e8. */
const PIN = '4r2k/8/8/8/8/8/4N3/4K3 b - - 0 1';
/** Back-rank mate in one with Ra8#. */
const BACK_RANK = '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1';

describe('position probes', () => {
  it('rewrites the side to move without touching anything else', () => {
    expect(withSideToMove('4k3/8/8/8/8/8/8/4K3 w - - 0 1', 'b')).toBe('4k3/8/8/8/8/8/8/4K3 b - - 0 1');
  });

  it('answers capture questions using legal moves only', () => {
    const game = new AuroraGame(HANGING_QUEEN);
    expect(canCapture(game.fen, 'b', 'd6', 'e5')).toBe(true);
    expect(canCapture(game.fen, 'w', 'e5', 'd6')).toBe(true);
    // The white king cannot reach e5 in one move.
    expect(canCapture(game.fen, 'w', 'e1', 'e5')).toBe(false);
  });

  it('finds hanging pieces for the side that owns them', () => {
    const game = new AuroraGame(HANGING_QUEEN);
    const hanging = hangingPieces(game, 'w');
    expect(hanging.map(p => p.square)).toContain('e5');
    expect(hanging[0].type).toBe('q');
    // Nothing is hanging in the initial position.
    expect(hangingPieces(new AuroraGame(), 'w')).toHaveLength(0);
    expect(hangingPieces(new AuroraGame(), 'b')).toHaveLength(0);
    // Mutual attacks are reported for both sides: the black pawn on d6 is
    // attacked by the queen and undefended, even though it can take the queen.
    expect(hangingPieces(game, 'b').map(p => p.square)).toContain('d6');
  });

  it('finds free captures for the side to move', () => {
    const captures = freeCaptures(new AuroraGame(HANGING_QUEEN), 'b');
    expect(captures.map(p => p.square)).toContain('e5');
    const best = bestFreeCapture(new AuroraGame(HANGING_QUEEN), 'b');
    expect(best?.lan).toBe('d6e5');
    expect(best?.san).toBe('dxe5');
  });

  it('does not claim a free capture for the side that is not to move', () => {
    expect(bestFreeCapture(new AuroraGame(HANGING_QUEEN), 'w')).toBeNull();
  });

  it('detects a knight fork of king and rook', () => {
    const game = new AuroraGame(FORK);
    const forks = forkMoves(game, 'w');
    const knightFork = forks.find(fork => fork.lan === 'c3d5');
    expect(knightFork).toBeDefined();
    expect(knightFork!.targets.map(t => t.square).sort()).toEqual(['c7', 'e7']);
  });

  it('detects pinned pieces', () => {
    const game = new AuroraGame(PIN);
    const pinned = pinnedPieces(game, 'w');
    expect(pinned.map(p => p.square)).toContain('e2');
    expect(pinned[0].type).toBe('n');
  });

  it('scores king safety and development', () => {
    const start = new AuroraGame();
    expect(kingSafety(start, 'w').pawnShield).toBe(3);
    expect(kingSafety(start, 'w').exposed).toBe(false);
    expect(undevelopedCount(start, 'w')).toBe(4);
    // Castled position keeps the shield after O-O.
    const castled = AuroraGame.fromMoves(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O']);
    expect(castled.moves.some(m => m.isCastle === 'kingside')).toBe(true);
    expect(kingSafety(castled, 'w').pawnShield).toBe(3);
  });

  it('reports pawn structure weaknesses and strengths', () => {
    const doubled = new AuroraGame('4k3/8/8/8/8/3P4/3P4/4K3 w - - 0 1');
    expect(pawnStructure(doubled, 'w').doubled).toContain('d');

    const isolated = new AuroraGame('4k3/8/8/8/8/8/P7/4K3 w - - 0 1');
    expect(pawnStructure(isolated, 'w').isolated).toContain('a');

    const passed = new AuroraGame('4k3/8/8/8/8/8/P7/4K3 w - - 0 1');
    expect(pawnStructure(passed, 'w').passed).toContain('a');

    const blocked = new AuroraGame('4k3/8/8/8/8/p7/P7/4K3 w - - 0 1');
    expect(pawnStructure(blocked, 'w').passed).not.toContain('a');
  });
});

describe('coach findings', () => {
  it('finds mate in one', () => {
    const game = new AuroraGame(BACK_RANK);
    expect(mateInOne(game, 'w')?.san).toBe('Ra8#');
    expect(mateInOne(game, 'b')).toBeNull();
  });

  it('reports the hanging queen as a critical finding', () => {
    // Black to move: white's queen is the one at risk, from white's viewpoint.
    const game = new AuroraGame('4k3/8/3p4/4Q3/8/8/8/4K3 w - - 0 1');
    const findings = analysePosition(game, 'w');
    expect(findings[0].kind).toBe('hanging');
    expect(findings[0].severity).toBe('critical');
    expect(findings[0].i18n).toBe('diag.hanging');
    expect(findings[0].params.square).toBe('e5');
  });

  it('reports an opportunity when a free piece can be taken', () => {
    const findings = analysePosition(new AuroraGame(HANGING_QUEEN), 'b');
    const capture = findings.find(f => f.kind === 'can-capture');
    expect(capture).toBeDefined();
    expect(capture!.severity).toBe('good');
    expect(capture!.squares).toContain('e5');
  });

  it('treats a defended pawn as defended, even though the defender cannot move onto it', () => {
    // 1.e4 e5 2.d4: the d4 pawn is attacked by the e5 pawn but defended by the
    // queen on d1. Asking "can the queen move to d4?" would wrongly say no —
    // the square is occupied by the friendly pawn.
    const game = AuroraGame.fromMoves(['e4', 'e5', 'd4']);
    expect(canCapture(game.fen, 'w', 'd1', 'd4')).toBe(false);
    expect(defendsSquare(game, 'd4', 'w')).toBe(true);
    expect(hangingPieces(game, 'w').map(p => p.square)).not.toContain('d4');
  });

  it('still flags genuinely loose pawns', () => {
    // A pawn attacked by a pawn with nothing defending it.
    const loose = new AuroraGame('4k3/8/8/2p5/3P4/8/8/4K3 w - - 0 1');
    expect(hangingPieces(loose, 'w').map(p => p.square)).toContain('d4');
    // Put a rook on the d-file and the same pawn is defended.
    const defended = new AuroraGame('4k3/8/8/2p5/3P4/8/8/3RK3 w - - 0 1');
    expect(defendsSquare(defended, 'd4', 'w')).toBe(true);
    expect(hangingPieces(defended, 'w').map(p => p.square)).not.toContain('d4');
  });

  it('does not call pawns hanging when a rook, queen or king covers them', () => {
    // After 1.e4 d5 2.exd5 Qxd5 the queen attacks a2, d2 and g2 — but all three
    // are covered (Ra1, Qd1/Ke1, Bf1), so none of them is hanging.
    const game = AuroraGame.fromMoves(['e4', 'd5', 'exd5', 'Qxd5']);
    const hanging = hangingPieces(game, 'w').map(p => p.square);
    expect(hanging).not.toContain('a2');
    expect(hanging).not.toContain('d2');
    expect(hanging).not.toContain('g2');
  });

  it('does not count a pinned defender as a defender', () => {
    // White Nd2 defends b3 — but only when it is not pinned to the king on d1.
    const pinned = new AuroraGame('3r3k/8/8/8/2p5/1P6/3N4/3K4 w - - 0 1');
    expect(defendsSquare(pinned, 'b3', 'w')).toBe(false);
    // Same position without the pin: the knight really does defend b3.
    const free = new AuroraGame('r6k/8/8/8/2p5/1P6/3N4/3K4 w - - 0 1');
    expect(defendsSquare(free, 'b3', 'w')).toBe(true);
  });

  it('reports the fork as an opportunity', () => {
    const findings = analysePosition(new AuroraGame(FORK), 'w');
    expect(findings.some(f => f.kind === 'fork')).toBe(true);
  });

  it('reports pinned pieces as a warning', () => {
    const findings = analysePosition(new AuroraGame(PIN), 'w');
    expect(findings.some(f => f.kind === 'pin' && f.severity === 'warn')).toBe(true);
  });

  it('warns about undeveloped pieces in the opening', () => {
    const findings = analysePosition(new AuroraGame(), 'w');
    expect(findings.some(f => f.kind === 'undeveloped')).toBe(true);
  });

  it('describes what the opponent threatens', () => {
    // Black to move can win the queen: white must be warned about it.
    const threats = opponentThreats(new AuroraGame(HANGING_QUEEN), 'w');
    expect(threats.length).toBeGreaterThan(0);
    expect(threats[0].severity === 'critical' || threats[0].severity === 'warn').toBe(true);
  });

  it('returns nothing threatening in a quiet position', () => {
    expect(opponentThreats(new AuroraGame(), 'w')).toHaveLength(0);
  });

  it('keeps findings language agnostic', () => {
    const findings = analysePosition(new AuroraGame(HANGING_QUEEN), 'b');
    for (const finding of findings) {
      expect(finding.i18n).toMatch(/^diag\./);
      expect(typeof finding.params).toBe('object');
    }
  });
});
