/**
 * Shared chess domain types.
 *
 * These are intentionally framework free so that the game core can be unit
 * tested in plain Node (see `src/lib/chess/game.test.ts`).
 */

export type Color = 'w' | 'b';

export type PieceSymbol = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export type Square = string;

export interface BoardPiece {
  square: Square;
  type: PieceSymbol;
  color: Color;
}

export interface MoveInput {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
}

/** Every position we ever analyse is identified by its FEN. */
export interface PositionSnapshot {
  fen: string;
  turn: Color;
  /** Full move number, starting at 1. */
  moveNumber: number;
  /** Half move count (plies played), starting at 0. */
  ply: number;
}

/**
 * A played move plus the positions before/after it. Keeping both FENs means
 * reviews and the coach never have to replay the game to know what changed.
 */
export interface MoveRecord {
  /** 0 based ply index. */
  ply: number;
  moveNumber: number;
  color: Color;
  from: Square;
  to: Square;
  san: string;
  lan: string;
  piece: PieceSymbol;
  captured?: PieceSymbol;
  promotion?: PieceSymbol;
  /** chess.js move flags, e.g. "n" normal, "c" capture, "k"/"q" castle. */
  flags: string;
  before: string;
  after: string;
  /** True when the move gives check (not mate). */
  check: boolean;
  checkmate: boolean;
  isCapture: boolean;
  isCastle: 'kingside' | 'queenside' | null;
  isEnPassant: boolean;
}

export type GameEndReason =
  | 'checkmate'
  | 'stalemate'
  | 'insufficient-material'
  | 'threefold-repetition'
  | 'fifty-move-rule'
  | 'resign'
  | 'timeout'
  | 'draw-agreed'
  | 'aborted';

export type GameScore = '1-0' | '0-1' | '1/2-1/2' | '*';

export interface GameStatus {
  over: boolean;
  /** `null` for draws and for unfinished games. */
  winner: Color | null;
  reason: GameEndReason | null;
  score: GameScore;
}

export type GamePhase = 'opening' | 'middlegame' | 'endgame';

/** How good a move was, used by the coach and the review screen. */
export type MoveQuality =
  | 'book'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'forced';

export interface SquareHighlight {
  square: Square;
  kind: 'last-move' | 'check' | 'hint' | 'coach' | 'selected';
}

export interface ArrowShape {
  from: Square;
  to: Square;
  kind?: 'best' | 'hint' | 'threat' | 'user';
}
