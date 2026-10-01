import { AuroraGame } from '../chess/game';
import { PIECE_VALUE, rankIndex } from '../chess/pieces';
import type { Color, PieceSymbol, Square } from '../chess/types';

/**
 * Position probes that chess.js does not answer directly.
 *
 * `canCapture` flips the side to move in the FEN and asks for the *legal*
 * moves of the attacker. Using legal moves (instead of a geometric attack map)
 * means pinned attackers are correctly excluded — a pinned knight does not
 * really defend the square it appears to cover.
 */
export function withSideToMove(fen: string, color: Color): string {
  const parts = fen.split(' ');
  if (parts.length < 4) return fen;
  parts[1] = color;
  parts[3] = '-'; // en passant is irrelevant for these probes
  return parts.join(' ');
}

export function canCapture(fen: string, color: Color, from: Square, to: Square): boolean {
  try {
    const probe = new AuroraGame(withSideToMove(fen, color));
    return probe.legalMovesFrom(from).some(m => m.to === to);
  } catch {
    return false;
  }
}

/** Cheapest legal attacker of `square`, by piece value. */
export function cheapestAttacker(game: AuroraGame, square: Square, by: Color): { square: Square; type: PieceSymbol } | null {
  const attackers = game
    .attackersOf(square, by)
    .map(sq => ({ square: sq, type: game.pieceMap()[sq]?.type }))
    .filter((a): a is { square: Square; type: PieceSymbol } => !!a.type)
    .filter(a => canCapture(game.fen, by, a.square, square))
    .sort((a, b) => PIECE_VALUE[a.type] - PIECE_VALUE[b.type]);
  return attackers[0] ?? null;
}

/**
 * True when `color` can recapture on `square` — i.e. the piece standing there
 * is defended.
 *
 * The obvious test ("can a friendly piece move to `square`?") is wrong: the
 * square is occupied by the friendly piece itself, so the move is blocked. The
 * piece is therefore swapped for an enemy one and we ask whether any friendly
 * piece can capture it, which also correctly excludes pinned defenders.
 */
export function defendsSquare(game: AuroraGame, square: Square, color: Color): boolean {
  const map = game.pieceMap();
  const piece = map[square];
  if (!piece || piece.type === 'k') return false;
  const enemy: Color = color === 'w' ? 'b' : 'w';
  const probeMap: Record<string, { type: PieceSymbol; color: Color }> = {
    ...map,
    [square]: { type: piece.type, color: enemy },
  };
  try {
    const probe = new AuroraGame(boardMapToFen(probeMap, color, game.fen));
    return game
      .attackersOf(square, color)
      .some(from => from !== square && probe.legalMovesFrom(from).some(move => move.to === square));
  } catch {
    return false;
  }
}

export interface PieceRef {
  square: Square;
  type: PieceSymbol;
}

/** Pieces of `color` that the opponent can capture without losing material. */
export function hangingPieces(game: AuroraGame, color: Color): PieceRef[] {
  const enemy: Color = color === 'w' ? 'b' : 'w';
  const map = game.pieceMap();
  const out: PieceRef[] = [];
  for (const piece of game.pieces()) {
    if (piece.color !== color || piece.type === 'k') continue;
    const attacker = cheapestAttacker(game, piece.square, enemy);
    if (!attacker) continue;
    const defended = defendsSquare(game, piece.square, color);
    // Undefended, or attacked by something cheaper than the piece itself.
    if (!defended || PIECE_VALUE[attacker.type] < PIECE_VALUE[piece.type] - 20) {
      out.push({ square: piece.square, type: map[piece.square]?.type ?? piece.type });
    }
  }
  return out.sort((a, b) => PIECE_VALUE[b.type] - PIECE_VALUE[a.type]);
}

/** Enemy pieces of `color`'s opponent that `color` can win material from. */
export function freeCaptures(game: AuroraGame, color: Color): PieceRef[] {
  const enemy: Color = color === 'w' ? 'b' : 'w';
  const map = game.pieceMap();
  const out: PieceRef[] = [];
  for (const piece of game.pieces()) {
    if (piece.color !== enemy) continue;
    const attacker = cheapestAttacker(game, piece.square, color);
    if (!attacker) continue;
    if (!defendsSquare(game, piece.square, enemy) && piece.type !== 'k') {
      out.push({ square: piece.square, type: map[piece.square]?.type ?? piece.type });
    }
  }
  return out.sort((a, b) => PIECE_VALUE[b.type] - PIECE_VALUE[a.type]);
}

export interface ForkMove {
  lan: string;
  san: string;
  targets: PieceRef[];
}

/**
 * Legal moves by a knight, queen or pawn that attack two or more valuable
 * enemy pieces at once (including the king, which makes it a royal fork).
 */
export function forkMoves(game: AuroraGame, color: Color, limit = 3): ForkMove[] {
  if (game.turn !== color) return [];
  const enemy: Color = color === 'w' ? 'b' : 'w';
  const out: ForkMove[] = [];
  for (const move of game.legalMoveList()) {
    if (!['n', 'q', 'p'].includes(move.piece)) continue;
    const probe = game.clone();
    try {
      probe.moveByNotation(move.lan);
    } catch {
      continue;
    }
    if (probe.status().over) continue;
    // Which enemy pieces does the moved piece attack now?
    const targets: PieceRef[] = [];
    for (const piece of probe.pieces()) {
      if (piece.color !== enemy) continue;
      if (piece.type === 'k') {
        // A check counts as a fork target only when it wins material elsewhere.
        if (probe.isCheck()) targets.push({ square: piece.square, type: piece.type });
        continue;
      }
      if (!canCapture(probe.fen, color, move.to, piece.square)) continue;
      if (!defendsSquare(probe, piece.square, enemy) && PIECE_VALUE[piece.type] >= 300) {
        targets.push({ square: piece.square, type: piece.type });
      }
    }
    const materialTargets = targets.filter(t => t.type !== 'k');
    const meaningful = materialTargets.length >= 2 || (targets.some(t => t.type === 'k') && materialTargets.length >= 1);
    if (meaningful) {
      out.push({ lan: move.lan, san: move.san, targets });
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** Pieces of `color` that cannot legally move because they shield the king. */
export function pinnedPieces(game: AuroraGame, color: Color): PieceRef[] {
  const enemy: Color = color === 'w' ? 'b' : 'w';
  const kingSquare = game.kingSquare(color);
  if (!kingSquare) return [];
  const out: PieceRef[] = [];
  for (const piece of game.pieces()) {
    if (piece.color !== color || piece.type === 'k') continue;
    try {
      const probe = game.clone();
      // Removing the piece from the board (via FEN edit) exposes the king if
      // the piece was pinned.
      const map = probe.pieceMap();
      delete map[piece.square];
      const fen = boardMapToFen(map, probe.fen.split(' ')[1] as Color, probe.fen);
      const checkProbe = new AuroraGame(fen);
      if (checkProbe.isAttacked(kingSquare, enemy)) out.push({ square: piece.square, type: piece.type });
    } catch {
      // ignore
    }
  }
  return out;
}

/** Rebuilds a FEN from a piece map, keeping the original side-to-move/castling. */
export function boardMapToFen(map: Record<string, { type: PieceSymbol; color: Color }>, turn: Color, template: string): string {
  const parts = template.split(' ');
  const rows: string[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const square = `${String.fromCharCode(97 + file)}${rank + 1}`;
      const piece = map[square];
      if (!piece) {
        empty++;
        continue;
      }
      if (empty) {
        row += String(empty);
        empty = 0;
      }
      row += piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
    }
    if (empty) row += String(empty);
    rows.push(row);
  }
  return [rows.join('/'), turn, parts[2] ?? '-', '-', parts[4] ?? '0', parts[5] ?? '1'].join(' ');
}

export interface KingSafety {
  /** Friendly pawns on the three squares in front of the king. */
  pawnShield: number;
  /** Enemy pieces attacking squares around the king. */
  attackers: number;
  /** True when the king has no pawn cover at all. */
  exposed: boolean;
  square: Square | null;
}

export function kingSafety(game: AuroraGame, color: Color): KingSafety {
  const square = game.kingSquare(color);
  if (!square) return { pawnShield: 0, attackers: 0, exposed: true, square: null };
  const enemy: Color = color === 'w' ? 'b' : 'w';
  const file = square.charCodeAt(0) - 97;
  const rank = rankIndex(square);
  const direction = color === 'w' ? 1 : -1;

  let pawnShield = 0;
  for (const df of [-1, 0, 1]) {
    const f = file + df;
    const r = rank + direction;
    if (f < 0 || f > 7 || r < 0 || r > 7) continue;
    const sq = `${String.fromCharCode(97 + f)}${r + 1}`;
    const piece = game.pieceMap()[sq];
    if (piece && piece.color === color && piece.type === 'p') pawnShield++;
  }

  let attackers = 0;
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      const f = file + df;
      const r = rank + dr;
      if (f < 0 || f > 7 || r < 0 || r > 7) continue;
      const sq = `${String.fromCharCode(97 + f)}${r + 1}`;
      if (game.attackersOf(sq, enemy).length) attackers++;
    }
  }
  return { pawnShield, attackers, exposed: pawnShield === 0, square };
}

/** Minor pieces still sitting on their starting squares. */
export function undevelopedCount(game: AuroraGame, color: Color): number {
  const home = color === 'w' ? ['b1', 'c1', 'f1', 'g1'] : ['b8', 'c8', 'f8', 'g8'];
  const map = game.pieceMap();
  return home.filter(sq => {
    const piece = map[sq];
    return !!piece && piece.color === color && (piece.type === 'n' || piece.type === 'b');
  }).length;
}

export function hasCastled(game: AuroraGame, color: Color): boolean {
  return game.moves.some(m => m.color === color && m.isCastle);
}

export function centerControl(game: AuroraGame, color: Color): number {
  const center = ['d4', 'e4', 'd5', 'e5'];
  const enemy: Color = color === 'w' ? 'b' : 'w';
  let score = 0;
  for (const sq of center) {
    const piece = game.pieceMap()[sq];
    if (piece?.color === color && (piece.type === 'p' || piece.type === 'n')) score += 2;
    score += Math.min(2, game.attackersOf(sq, color).length);
    score -= Math.min(2, game.attackersOf(sq, enemy).length) * 0.5;
  }
  return Math.round(score);
}

export interface PawnStructure {
  doubled: string[];
  isolated: string[];
  passed: string[];
}

export function pawnStructure(game: AuroraGame, color: Color): PawnStructure {
  const enemy: Color = color === 'w' ? 'b' : 'w';
  const own = game.pieces().filter(p => p.color === color && p.type === 'p');
  const theirs = game.pieces().filter(p => p.color === enemy && p.type === 'p');
  const filesOf = (list: typeof own) => list.map(p => p.square.charCodeAt(0) - 97);

  const ownFiles = filesOf(own);
  const doubled: string[] = [];
  for (const file of new Set(ownFiles)) {
    if (ownFiles.filter(f => f === file).length > 1) doubled.push(String.fromCharCode(97 + file));
  }

  const isolated: string[] = [];
  for (const file of new Set(ownFiles)) {
    const neighbours = ownFiles.filter(f => Math.abs(f - file) === 1);
    if (!neighbours.length) isolated.push(String.fromCharCode(97 + file));
  }

  const passed: string[] = [];
  for (const pawn of own) {
    const file = pawn.square.charCodeAt(0) - 97;
    const rank = rankIndex(pawn.square);
    const blockers = theirs.filter(p => {
      const pf = p.square.charCodeAt(0) - 97;
      const pr = rankIndex(p.square);
      if (Math.abs(pf - file) > 1) return false;
      return color === 'w' ? pr > rank : pr < rank;
    });
    if (!blockers.length) passed.push(String.fromCharCode(97 + file));
  }
  return { doubled, isolated, passed };
}

/** Pawns one step away from promoting. */
export function promotionThreats(game: AuroraGame, color: Color): PieceRef[] {
  const target = color === 'w' ? 7 : 2;
  return game
    .pieces()
    .filter(p => p.color === color && p.type === 'p' && rankIndex(p.square) + 1 === target)
    .map(p => ({ square: p.square, type: p.type }));
}

export interface BackRankRisk {
  weak: boolean;
  square: Square | null;
}

export function backRankRisk(game: AuroraGame, color: Color): BackRankRisk {
  const kingSquare = game.kingSquare(color);
  if (!kingSquare) return { weak: false, square: null };
  const rank = rankIndex(kingSquare);
  const homeRank = color === 'w' ? 0 : 7;
  if (rank !== homeRank) return { weak: false, square: null };
  const enemy: Color = color === 'w' ? 'b' : 'w';
  const map = game.pieceMap();
  const heavy = game
    .pieces()
    .filter(p => p.color === enemy && (p.type === 'r' || p.type === 'q'))
    .filter(p => rankIndex(p.square) === homeRank);
  // King has no escape hatch (no pawn directly in front) and enemy heavy piece
  // already shares the back rank.
  const inFront = map[`${kingSquare[0]}${rank + (color === 'w' ? 2 : -2)}`];
  const shielded = inFront && inFront.color === color;
  return { weak: heavy.length > 0 && !shielded, square: kingSquare };
}

export function materialFor(game: AuroraGame, color: Color): number {
  return game
    .pieces()
    .filter(p => p.color === color)
    .reduce((sum, p) => sum + PIECE_VALUE[p.type], 0);
}

/** Material balance in centipawns from white's point of view. */
export function materialBalance(game: AuroraGame): number {
  return materialFor(game, 'w') - materialFor(game, 'b');
}
