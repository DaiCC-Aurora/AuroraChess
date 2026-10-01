import { AuroraGame } from '../chess/game';
import type { MoveRecord } from '../chess/types';

/** Converts a UCI principal variation into SAN, stopping at the first bad move. */
export function pvToSan(game: AuroraGame, pv: string[], limit = 6): string[] {
  const clone = game.clone();
  const out: string[] = [];
  for (const lan of pv.slice(0, limit)) {
    try {
      const record = clone.moveByNotation(lan);
      out.push(record.san);
    } catch {
      break;
    }
  }
  return out;
}

/** SAN for a single UCI move in `game`'s position. */
export function lanToSan(game: AuroraGame, lan: string): string | null {
  return pvToSan(game, [lan], 1)[0] ?? null;
}

/** Compact `1. e4 e5 2. Nf3` rendering of a move list. */
export function formatMoves(moves: MoveRecord[]): string {
  const parts: string[] = [];
  for (const move of moves) {
    if (move.color === 'w') {
      parts.push(`${move.moveNumber}.${move.san}`);
      continue;
    }
    // Black's move only repeats the number when white's move is not shown
    // (a game that starts from a black-to-move position).
    const previous = parts[parts.length - 1];
    const whiteAlreadyShown = previous?.startsWith(`${move.moveNumber}.`) ?? false;
    parts.push(whiteAlreadyShown ? move.san : `${move.moveNumber}...${move.san}`);
  }
  return parts.join(' ');
}
