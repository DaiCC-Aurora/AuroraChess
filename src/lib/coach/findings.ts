import type { AuroraGame } from '../chess/game';
import { PIECE_VALUE } from '../chess/pieces';
import type { Color, GamePhase, PieceSymbol, Square } from '../chess/types';
import {
  backRankRisk,
  centerControl,
  freeCaptures,
  forkMoves,
  hangingPieces,
  hasCastled,
  kingSafety,
  materialBalance,
  pawnStructure,
  pinnedPieces,
  promotionThreats,
  undevelopedCount,
  type PieceRef,
} from './probe';

/**
 * Findings are language-agnostic: they carry an i18n key plus interpolation
 * params, so the same analysis renders in Chinese or English without any
 * string building down here.
 */
export type FindingKind =
  | 'in-check'
  | 'hanging'
  | 'can-capture'
  | 'loose'
  | 'fork'
  | 'pin'
  | 'king-exposed'
  | 'king-attacked'
  | 'mate-threat'
  | 'undeveloped'
  | 'center'
  | 'doubled-pawns'
  | 'isolated-pawn'
  | 'passed-pawn'
  | 'promotion-threat'
  | 'back-rank'
  | 'material-up'
  | 'material-down';

export type FindingSeverity = 'good' | 'info' | 'warn' | 'critical';

export interface Finding {
  kind: FindingKind;
  severity: FindingSeverity;
  /** Which side the statement is about. */
  subject: Color;
  /** i18n key, e.g. `diag.hanging`. */
  i18n: string;
  params: Record<string, string | number>;
  squares: Square[];
  /** Suggested move when the finding comes with one. */
  move?: { lan: string; san: string };
  priority: number;
}

const SEVERITY_WEIGHT: Record<FindingSeverity, number> = { critical: 400, warn: 300, good: 200, info: 100 };

function finding(kind: FindingKind, severity: FindingSeverity, subject: Color, i18n: string, squares: Square[] = [], params: Record<string, string | number> = {}, move?: Finding['move']): Finding {
  return { kind, severity, subject, i18n, params, squares, move, priority: SEVERITY_WEIGHT[severity] };
}

const piecesToSquares = (pieces: PieceRef[]): Square[] => pieces.map(p => p.square);

/** A move that checkmates in one, if one exists. */
export function mateInOne(game: AuroraGame, color: Color): { lan: string; san: string } | null {
  if (game.turn !== color) return null;
  for (const move of game.legalMoveList()) {
    const probe = game.clone();
    try {
      const played = probe.moveByNotation(move.lan);
      if (played.checkmate) return { lan: move.lan, san: move.san };
    } catch {
      continue;
    }
  }
  return null;
}

/** The most valuable free capture available to `color` right now. */
export function bestFreeCapture(game: AuroraGame, color: Color): { lan: string; san: string; target: PieceRef } | null {
  if (game.turn !== color) return null;
  const targets = freeCaptures(game, color);
  if (!targets.length) return null;
  const best = targets[0];
  for (const move of game.legalMoveList()) {
    if (move.to !== best.square || !move.isCapture) continue;
    return { lan: move.lan, san: move.san, target: best };
  }
  return null;
}

export interface AnalysisOptions {
  phase?: GamePhase;
  /** Opening book plies, used to avoid "develop your pieces" nagging later. */
  bookPlies?: number;
  /** Skip the expensive fork/loose-piece scans. */
  quick?: boolean;
}

/**
 * Static coaching report for the position, from `perspective`'s point of view.
 * Sorted by importance: critical threats first, then opportunities, then advice.
 */
export function analysePosition(game: AuroraGame, perspective: Color, options: AnalysisOptions = {}): Finding[] {
  const out: Finding[] = [];
  const opponent: Color = perspective === 'w' ? 'b' : 'w';
  const phase = options.phase ?? game.phase();
  const toMove = game.turn;

  // --- immediate danger -------------------------------------------------
  if (game.isCheck() && toMove === perspective) {
    out.push(finding('in-check', 'critical', perspective, 'diag.inCheck', [game.kingSquare(perspective) ?? 'a1']));
  }

  const hanging = hangingPieces(game, perspective);
  if (hanging.length) {
    const worst = hanging[0];
    out.push(
      finding('hanging', 'critical', perspective, 'diag.hanging', piecesToSquares(hanging.slice(0, 3)), {
        piece: worst.type,
        square: worst.square,
      }),
    );
  }

  if (toMove === opponent) {
    const mate = mateInOne(game, opponent);
    if (mate) {
      out.push(finding('mate-threat', 'critical', perspective, 'diag.mateThreat', [], { move: mate.san }, mate));
    }
  }

  // --- opportunities ----------------------------------------------------
  if (toMove === perspective) {
    const mate = mateInOne(game, perspective);
    if (mate) {
      out.push(finding('mate-threat', 'good', perspective, 'diag.mateInOne', [], { move: mate.san }, mate));
    }
    const captures = freeCaptures(game, perspective);
    if (captures.length) {
      const best = captures[0];
      const move = bestFreeCapture(game, perspective);
      out.push(
        captures.length > 2
          ? finding('can-capture', 'good', perspective, 'diag.canCaptureMany', piecesToSquares(captures), { count: captures.length })
          : finding('can-capture', 'good', perspective, 'diag.canCapture', [best.square], {
              piece: best.type,
              square: best.square,
            }, move ?? undefined),
      );
    }
    if (!options.quick) {
      const forks = forkMoves(game, perspective, 2);
      if (forks.length) {
        const fork = forks[0];
        out.push(
          finding('fork', 'good', perspective, 'diag.fork', fork.targets.map(t => t.square), {
            move: fork.san,
          }, { lan: fork.lan, san: fork.san }),
        );
      }
    }
  }

  // --- positional health ------------------------------------------------
  const pins = pinnedPieces(game, perspective);
  if (pins.length) {
    out.push(
      finding('pin', 'warn', perspective, 'diag.pin', piecesToSquares(pins.slice(0, 2)), {
        piece: pins[0].type,
        square: pins[0].square,
      }),
    );
  }

  const safety = kingSafety(game, perspective);
  if (safety.exposed && phase !== 'endgame') {
    out.push(finding('king-exposed', 'warn', perspective, 'diag.kingOpen', safety.square ? [safety.square] : []));
  } else if (safety.attackers >= 3) {
    out.push(
      finding('king-attacked', 'warn', perspective, 'diag.kingAttackers', safety.square ? [safety.square] : [], {
        count: safety.attackers,
      }),
    );
  }

  if (phase === 'opening' || (options.bookPlies ?? 0) > 0) {
    const undeveloped = undevelopedCount(game, perspective);
    const castled = hasCastled(game, perspective);
    if (undeveloped >= 3 && !castled) {
      out.push(finding('undeveloped', 'info', perspective, 'diag.development', [], { count: undeveloped }));
    }
  }

  if (phase === 'opening' && centerControl(game, perspective) <= 3) {
    out.push(finding('center', 'info', perspective, 'diag.center'));
  }

  const structure = pawnStructure(game, perspective);
  if (structure.doubled.length) {
    out.push(finding('doubled-pawns', 'info', perspective, 'diag.doubled', [], { file: structure.doubled[0] }));
  }
  if (structure.isolated.length) {
    out.push(finding('isolated-pawn', 'info', perspective, 'diag.isolated', [], { file: structure.isolated[0] }));
  }
  if (structure.passed.length) {
    out.push(finding('passed-pawn', 'good', perspective, 'diag.passed', [], { file: structure.passed[0] }));
  }

  const promotion = promotionThreats(game, perspective);
  if (promotion.length) {
    out.push(finding('promotion-threat', 'good', perspective, 'diag.promotion', piecesToSquares(promotion)));
  }
  const enemyPromotion = promotionThreats(game, opponent);
  if (enemyPromotion.length) {
    out.push(finding('promotion-threat', 'critical', perspective, 'diag.enemyPromotion', piecesToSquares(enemyPromotion)));
  }

  const backRank = backRankRisk(game, perspective);
  if (backRank.weak) {
    out.push(finding('back-rank', 'warn', perspective, 'diag.backRank', backRank.square ? [backRank.square] : []));
  }

  const balance = materialBalance(game);
  const own = perspective === 'w' ? balance : -balance;
  if (Math.abs(own) >= 200) {
    out.push(
      finding(own > 0 ? 'material-up' : 'material-down', own > 0 ? 'good' : 'info', perspective, own > 0 ? 'diag.materialUp' : 'diag.materialDown', [], {
        pawns: Math.abs(own / 100).toFixed(1),
      }),
    );
  }

  return out.sort((a, b) => b.priority - a.priority);
}

/** What the opponent is threatening on their next move. */
export function opponentThreats(game: AuroraGame, perspective: Color, limit = 2): Finding[] {
  const opponent: Color = perspective === 'w' ? 'b' : 'w';
  if (game.turn !== opponent) return [];
  const out: Finding[] = [];
  const mate = mateInOne(game, opponent);
  if (mate) {
    out.push(finding('mate-threat', 'critical', perspective, 'diag.opponentMate', [], { move: mate.san }, mate));
  }
  const free = freeCaptures(game, opponent).filter(p => PIECE_VALUE[p.type] >= 300);
  if (free.length) {
    out.push(
      finding('hanging', 'warn', perspective, 'diag.threat', piecesToSquares(free.slice(0, limit)), {
        piece: free[0].type,
        square: free[0].square,
      }),
    );
  }
  return out;
}

/** Classifies a piece symbol for display in the UI. */
export function pieceLabelKey(type: PieceSymbol): string {
  return `piece.${type}`;
}
