/**
 * Fallback opponent for environments where the WASM engine cannot run
 * (blocked asset, ancient browser, watch in battery-saver mode).
 *
 * It is deliberately simple — material, captures, checks, one-ply lookahead —
 * but it goes through the same `selectMove` difficulty filter as the real
 * engine, so the ELO slider still changes how it plays.
 */

import type { AuroraGame } from '../chess/game';
import { PIECE_VALUE } from '../chess/pieces';
import { selectMove, type EngineLevel, type MoveCandidate } from './levels';

/** Static evaluation from the side-to-move's perspective, in centipawns. */
export function materialEval(game: AuroraGame): number {
  let score = 0;
  for (const piece of game.pieces()) {
    const value = PIECE_VALUE[piece.type];
    score += piece.color === 'w' ? value : -value;
  }
  return game.turn === 'w' ? score : -score;
}

export interface FallbackMove {
  move: string;
  deliberate: boolean;
  /** Centipawn-ish score of the chosen move. */
  score: number;
}

/**
 * Scores every legal move with a shallow heuristic and picks one through the
 * difficulty filter. Returns `null` when the game is over.
 */
export function pickFallbackMove(
  game: AuroraGame,
  level: EngineLevel,
  random: () => number = Math.random,
): FallbackMove | null {
  const legal = game.legalMoveList();
  if (!legal.length) return null;

  const scored = legal.map(move => {
    let score = 0;
    if (move.captured) score += PIECE_VALUE[move.captured] * 0.9;
    if (move.promotion) score += PIECE_VALUE[move.promotion] - PIECE_VALUE.p;
    if (move.isCastle) score += 30;

    const clone = game.clone();
    try {
      const played = clone.moveByNotation(move.lan);
      if (played.checkmate) score += 100_000;
      else if (played.check) score += 40;
      // Soft positional term: the opponent's material view after our move.
      score -= materialEval(clone) * 0.1;
      // Central control, cheap and cheerful.
      if (move.piece === 'p' || move.piece === 'n') score += centreBonus(move.to);
    } catch {
      score = -100_000;
    }
    return { move: move.lan, score, noise: random() * 30 };
  });

  scored.sort((a, b) => b.score + b.noise - (a.score + a.noise));
  const bestScore = scored[0].score + scored[0].noise;
  const candidates: MoveCandidate[] = scored.map(s => ({
    move: s.move,
    lossCp: Math.max(0, Math.round(bestScore - (s.score + s.noise))),
  }));

  const selection = selectMove(candidates, level, random);
  const chosen = scored.find(s => s.move === selection.move) ?? scored[0];
  return { move: chosen.move, deliberate: selection.deliberate, score: chosen.score };
}

function centreBonus(square: string): number {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  const distance = Math.abs(3.5 - file) + Math.abs(3.5 - rank);
  return Math.round((7 - distance) * 3);
}
