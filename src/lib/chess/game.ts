import { Chess, DEFAULT_POSITION } from 'chess.js';
import type { Move } from 'chess.js';
import { otherColor } from './pieces';
import type {
  BoardPiece,
  Color,
  GameEndReason,
  GamePhase,
  GameScore,
  GameStatus,
  MoveInput,
  MoveRecord,
  PieceSymbol,
  PositionSnapshot,
  Square,
} from './types';

export class IllegalMoveError extends Error {
  constructor(
    readonly from: string,
    readonly to: string,
    detail?: string,
  ) {
    super(detail ?? `Illegal move: ${from}${to}`);
    this.name = 'IllegalMoveError';
  }
}

export type MoveAttempt = { ok: true; move: MoveRecord } | { ok: false; reason: string };

/** A legal move that has not been played (used for search and move lists). */
export interface LegalMove {
  lan: string;
  san: string;
  from: Square;
  to: Square;
  piece: PieceSymbol;
  captured?: PieceSymbol;
  promotion?: PieceSymbol;
  isCapture: boolean;
  isCastle: 'kingside' | 'queenside' | null;
  isEnPassant: boolean;
  isPromotion: boolean;
}

function toRecord(move: Move, ply: number): MoveRecord {
  const isCastle = move.isKingsideCastle() ? 'kingside' : move.isQueensideCastle() ? 'queenside' : null;
  // `after` is the resulting FEN; cheap mate detection without replaying.
  const afterBoard = new Chess(move.after);
  const check = afterBoard.isCheck();
  return {
    ply,
    moveNumber: Math.floor(ply / 2) + 1,
    color: move.color,
    from: move.from,
    to: move.to,
    san: move.san,
    lan: move.lan || `${move.from}${move.to}${move.promotion ?? ''}`,
    piece: move.piece,
    captured: move.captured,
    promotion: move.promotion,
    flags: move.flags,
    before: move.before,
    after: move.after,
    check,
    checkmate: check && afterBoard.isCheckmate(),
    isCapture: move.isCapture(),
    isCastle,
    isEnPassant: move.isEnPassant(),
  };
}

/**
 * Thin, opinionated wrapper around chess.js.
 *
 * Responsibilities beyond chess.js:
 *  - every move carries the FEN before/after it (needed by the coach + review),
 *  - game termination is described uniformly, including endings chess.js cannot
 *    know about (resign / flag fall),
 *  - an engine-ready `position` command is produced for the UCI layer.
 */
export class AuroraGame {
  private chess: Chess;
  private readonly initialFen: string;
  private endOverride: { reason: GameEndReason; winner: Color | null } | null = null;

  constructor(fen: string = DEFAULT_POSITION) {
    this.chess = new Chess(fen);
    this.initialFen = fen;
  }

  static fromPgn(pgn: string): AuroraGame {
    const game = new AuroraGame();
    game.chess.loadPgn(pgn);
    return game;
  }

  static fromMoves(moves: string[], fen: string = DEFAULT_POSITION): AuroraGame {
    const game = new AuroraGame(fen);
    for (const move of moves) game.chess.move(move);
    return game;
  }

  clone(): AuroraGame {
    const copy = AuroraGame.fromMoves(this.moves.map(m => m.lan), this.initialFen);
    if (this.endOverride) copy.endOverride = { ...this.endOverride };
    return copy;
  }

  // ---------------------------------------------------------------- state ---

  get fen(): string {
    return this.chess.fen();
  }

  get turn(): Color {
    return this.chess.turn();
  }

  get moveNumber(): number {
    return this.chess.moveNumber();
  }

  get plyCount(): number {
    return this.moves.length;
  }

  get moves(): MoveRecord[] {
    return this.chess.history({ verbose: true }).map((m, i) => toRecord(m, i));
  }

  get lastMove(): MoveRecord | null {
    const all = this.chess.history({ verbose: true });
    if (!all.length) return null;
    return toRecord(all[all.length - 1], all.length - 1);
  }

  snapshot(): PositionSnapshot {
    return { fen: this.fen, turn: this.turn, moveNumber: this.moveNumber, ply: this.plyCount };
  }

  pieces(): BoardPiece[] {
    const out: BoardPiece[] = [];
    for (const row of this.chess.board()) {
      for (const cell of row) {
        if (cell) out.push({ square: cell.square, type: cell.type as PieceSymbol, color: cell.color as Color });
      }
    }
    return out;
  }

  /** Square -> piece map, the shape the board component renders from. */
  pieceMap(): Record<string, { type: PieceSymbol; color: Color }> {
    const map: Record<string, { type: PieceSymbol; color: Color }> = {};
    for (const p of this.pieces()) map[p.square] = { type: p.type, color: p.color };
    return map;
  }

  // ---------------------------------------------------------------- moves ---

  legalMovesFrom(square: Square): Move[] {
    return this.chess.moves({ square: square as never, verbose: true });
  }

  legalMoveCount(): number {
    return this.chess.moves().length;
  }

  /** Every legal move in a light, serialisable shape (no move is played). */
  legalMoveList(): LegalMove[] {
    return this.chess.moves({ verbose: true }).map(m => ({
      lan: m.lan || `${m.from}${m.to}${m.promotion ?? ''}`,
      san: m.san,
      from: m.from,
      to: m.to,
      piece: m.piece,
      captured: m.captured,
      promotion: m.promotion,
      isCapture: m.isCapture(),
      isCastle: m.isKingsideCastle() ? 'kingside' : m.isQueensideCastle() ? 'queenside' : null,
      isEnPassant: m.isEnPassant(),
      isPromotion: m.isPromotion(),
    }));
  }

  legalTargets(square: Square): { to: Square; promotion?: PieceSymbol; isCapture: boolean }[] {
    return this.legalMovesFrom(square).map(m => ({
      to: m.to,
      promotion: m.promotion,
      isCapture: m.isCapture() || m.isEnPassant(),
    }));
  }

  /** True when the move needs the player to choose a promotion piece. */
  needsPromotion(from: Square, to: Square): boolean {
    return this.legalMovesFrom(from).some(m => m.to === to && m.isPromotion());
  }

  tryMove(input: MoveInput): MoveAttempt {
    const legal = this.legalMovesFrom(input.from).filter(m => m.to === input.to);
    if (!legal.length) return { ok: false, reason: 'no-legal-move' };
    if (legal.some(m => m.isPromotion()) && !input.promotion) return { ok: false, reason: 'promotion-required' };
    try {
      const played = this.chess.move({ from: input.from, to: input.to, promotion: input.promotion });
      if (!played) return { ok: false, reason: 'rejected' };
      this.endOverride = null;
      return { ok: true, move: toRecord(played, this.plyCount - 1) };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : 'illegal' };
    }
  }

  move(input: MoveInput): MoveRecord {
    const attempt = this.tryMove(input);
    if (!attempt.ok) throw new IllegalMoveError(input.from, input.to, attempt.reason);
    return attempt.move;
  }

  /** Plays a SAN or LAN move (used for engine replies and PGN replay). */
  moveByNotation(notation: string): MoveRecord {
    try {
      const played = this.chess.move(notation);
      if (!played) throw new IllegalMoveError(notation, notation);
      this.endOverride = null;
      return toRecord(played, this.plyCount - 1);
    } catch (err) {
      if (err instanceof IllegalMoveError) throw err;
      throw new IllegalMoveError(notation, notation, err instanceof Error ? err.message : undefined);
    }
  }

  undo(): MoveRecord | null {
    const undone = this.chess.undo();
    if (!undone) return null;
    this.endOverride = null;
    return toRecord(undone, this.plyCount);
  }

  // -------------------------------------------------------- board queries ---

  isCheck(): boolean {
    return this.chess.isCheck();
  }

  kingSquare(color: Color = this.turn): Square | null {
    return (this.chess.findPiece({ type: 'k', color })[0] as Square | undefined) ?? null;
  }

  attackersOf(square: Square, color?: Color): Square[] {
    return this.chess.attackers(square as never, color as never) as Square[];
  }

  isAttacked(square: Square, by: Color): boolean {
    return this.chess.isAttacked(square as never, by as never);
  }

  // ------------------------------------------------------------ game over ---

  /** Records an ending chess.js cannot detect (resignation, timeout). */
  endGame(reason: GameEndReason, winner: Color | null): void {
    this.endOverride = { reason, winner };
  }

  clearEndOverride(): void {
    this.endOverride = null;
  }

  status(): GameStatus {
    if (this.endOverride) {
      const { reason, winner } = this.endOverride;
      const score: GameScore = winner === 'w' ? '1-0' : winner === 'b' ? '0-1' : '1/2-1/2';
      return { over: true, winner, reason, score };
    }
    const turn = this.turn;
    if (this.chess.isCheckmate()) {
      const winner = otherColor(turn);
      return { over: true, winner, reason: 'checkmate', score: winner === 'w' ? '1-0' : '0-1' };
    }
    const draw = (reason: GameEndReason): GameStatus => ({ over: true, winner: null, reason, score: '1/2-1/2' });
    if (this.chess.isStalemate()) return draw('stalemate');
    if (this.chess.isInsufficientMaterial()) return draw('insufficient-material');
    if (this.chess.isThreefoldRepetition()) return draw('threefold-repetition');
    if (this.chess.isDrawByFiftyMoves()) return draw('fifty-move-rule');
    return { over: false, winner: null, reason: null, score: '*' };
  }

  get isOver(): boolean {
    return this.status().over;
  }

  // -------------------------------------------------------------- engine ---

  /**
   * UCI `position` command for the current position.
   *
   * `position fen <initial> moves <lan...>` is used rather than the current FEN
   * so the engine keeps the full repetition history, which matters for correct
   * evaluation of threefold-ish positions.
   */
  uciPositionCommand(): string {
    const moves = this.chess.history({ verbose: true }).map(m => m.lan || `${m.from}${m.to}${m.promotion ?? ''}`);
    const base =
      this.initialFen === DEFAULT_POSITION ? 'position startpos' : `position fen ${this.initialFen}`;
    return moves.length ? `${base} moves ${moves.join(' ')}` : base;
  }

  uciHistory(): string[] {
    return this.chess.history({ verbose: true }).map(m => m.lan || `${m.from}${m.to}${m.promotion ?? ''}`);
  }

  // ----------------------------------------------------------------- pgn ---

  pgn(headers: Record<string, string> = {}): string {
    const merged: Record<string, string> = { ...headers };
    if (!merged.Result) merged.Result = this.status().score;
    if (!merged.Date) merged.Date = new Date().toISOString().slice(0, 10);
    for (const [key, value] of Object.entries(merged)) this.chess.setHeader(key, value);
    return this.chess.pgn({ maxWidth: 80, newline: '\n' });
  }

  /** Coarse phase detection used to pick the right coaching vocabulary. */
  phase(): GamePhase {
    const pieces = this.pieces();
    const material = pieces.reduce((sum, p) => {
      const values: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
      return sum + values[p.type];
    }, 0);
    if (this.plyCount < 20 && material > 40) return 'opening';
    if (material <= 24) return 'endgame';
    return 'middlegame';
  }
}
