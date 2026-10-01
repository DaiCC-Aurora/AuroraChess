import type { Color, PieceSymbol } from './types';

export const PIECE_ORDER: PieceSymbol[] = ['k', 'q', 'r', 'b', 'n', 'p'];

/** Conventional material values in centipawns (king excluded). */
export const PIECE_VALUE: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

export const PIECE_NAME_ZH: Record<PieceSymbol, string> = {
  p: '兵',
  n: '马',
  b: '象',
  r: '车',
  q: '后',
  k: '王',
};

export const PIECE_NAME_EN: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;

export function fileIndex(square: string): number {
  return square.charCodeAt(0) - 97;
}

export function rankIndex(square: string): number {
  return Number(square[1]) - 1;
}

export function squareOf(file: number, rank: number): string | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return `${FILES[file]}${RANKS[rank]}`;
}

export function isLightSquare(square: string): boolean {
  return (fileIndex(square) + rankIndex(square)) % 2 === 1;
}

export function otherColor(color: Color): Color {
  return color === 'w' ? 'b' : 'w';
}

/** "e2e4" style long algebraic notation for a square pair. */
export function lanOf(from: string, to: string, promotion?: string): string {
  return `${from}${to}${promotion ?? ''}`;
}
