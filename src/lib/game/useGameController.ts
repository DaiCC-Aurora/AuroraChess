'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuroraGame } from '../chess/game';
import type { Color, GameStatus, MoveQuality, MoveRecord, PieceSymbol, Square } from '../chess/types';
import { PIECE_VALUE } from '../chess/pieces';
import {
  classifyMove,
  groupByMultiPv,
  scoreToCp,
  winProbability,
  type ClassificationInput,
} from '../engine/analysis';
import { pickFallbackMove } from '../engine/fallback';
import { capLevelForWatch, levelForElo, levelToUciOptions, selectMove, shouldUseBook, type MoveCandidate } from '../engine/levels';
import { useEngineActions, useEngineState } from '../engine/react';
import { parseUciMove } from '../engine/uci';
import { bookContinuations, isBookMove, lookupOpening, type Opening } from '../coach/openings';
import { lanToSan, pvToSan } from './pv';
import { loadJson, saveJson, STORAGE_KEYS } from '../store/persist';

export type GameMode = 'play' | 'coach';
export type InterruptLevel = 'inaccuracy' | 'mistake' | 'blunder';

export interface CoachVerdict {
  ply: number;
  san: string;
  lan: string;
  quality: MoveQuality;
  lossCp: number;
  bestSan: string | null;
  bestLan: string | null;
  bestPv: string[];
  interrupted: boolean;
}

export interface HintState {
  from: Square;
  to: Square;
  san: string;
  pv: string[];
}

export interface ControllerOptions {
  mode: GameMode;
  elo: number;
  playerColor: Color;
  coachEnabled: boolean;
  coachInterrupt: InterruptLevel;
  coachDepth: number;
  /** Caps depth/movetime for watch-sized devices. */
  watch?: boolean;
  /** Restore the previous game (Ply count limited) on mount. */
  persist?: boolean;
}

const COACH_MOVETIME_MS = 700;
const HINT_MOVETIME_MS = 900;
export const HINT_LEVEL: InterruptLevel[] = ['inaccuracy', 'mistake', 'blunder'];

const INTERRUPT_RANK: Record<InterruptLevel, number> = { inaccuracy: 1, mistake: 2, blunder: 3 };
const SEVERITY_RANK: Record<MoveQuality, number> = {
  book: 0,
  best: 0,
  excellent: 0,
  good: 0,
  forced: 0,
  inaccuracy: 1,
  mistake: 2,
  blunder: 3,
};

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Turns engine MultiPV output into weighted candidates for `selectMove`. */
function candidatesFrom(result: { lines: import('../engine/uci').EngineInfo[] }): MoveCandidate[] {
  const lines = groupByMultiPv(result.lines).filter(line => line.pv.length && line.score);
  if (!lines.length) return [];
  // All MultiPV scores share the side-to-move point of view, so losses are a
  // simple subtraction against the best line.
  const bestCp = scoreToCp(lines[0].score);
  return lines.map(line => ({ move: line.pv[0], lossCp: Math.max(0, bestCp - scoreToCp(line.score)) }));
}

export interface GameController {
  // position
  pieces: Record<string, { type: PieceSymbol; color: Color }>;
  fen: string;
  turn: Color;
  status: GameStatus;
  moves: MoveRecord[];
  lastMove: { from: Square; to: Square } | null;
  checkSquare: Square | null;
  opening: { opening: Opening; plies: number } | null;
  // interaction
  selected: Square | null;
  targets: { to: Square; isCapture: boolean }[];
  promotion: { from: Square; to: Square; color: Color } | null;
  orientation: Color;
  select: (square: Square | null) => void;
  move: (from: Square, to: Square) => void;
  promote: (piece: PieceSymbol) => void;
  cancelPromotion: () => void;
  flip: () => void;
  undo: () => void;
  reset: () => void;
  resign: () => void;
  // engine
  level: ReturnType<typeof levelForElo>;
  thinking: boolean;
  engineMove: MoveRecord | null;
  engineDeliberate: boolean;
  // coach
  verdict: CoachVerdict | null;
  verdictBlocking: boolean;
  dismissVerdict: () => void;
  retryVerdict: () => void;
  hint: HintState | null;
  requestHint: () => Promise<void>;
  clearHint: () => void;
  // clock
  clockMs: { w: number; b: number };
  activeClock: Color | null;
  /** Current game as PGN (headers included). */
  pgn: string;
}

export function useGameController(options: ControllerOptions): GameController {
  const { mode, elo, playerColor, coachEnabled, coachInterrupt, coachDepth, watch = false, persist = false } = options;
  const { search, setOptions, newGame } = useEngineActions();
  const engineState = useEngineState();
  const engineReady = engineState.ready;
  const engineFailed = engineState.failed;
  const supportedOptions = engineState.supportedOptions;

  const gameRef = useRef<AuroraGame | null>(null);
  if (!gameRef.current) {
    if (persist) {
      const saved = loadJson<{ pgn?: string }>(STORAGE_KEYS.lastGame, {});
      if (saved.pgn) {
        try {
          gameRef.current = AuroraGame.fromPgn(saved.pgn);
        } catch {
          gameRef.current = new AuroraGame();
        }
      }
    }
    gameRef.current ??= new AuroraGame();
  }
  const game = gameRef.current;

  const [version, setVersion] = useState(0);
  const [selected, setSelected] = useState<Square | null>(null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square; color: Color } | null>(null);
  const [orientation, setOrientation] = useState<Color>(playerColor);
  const [thinking, setThinking] = useState(false);
  const [engineMove, setEngineMove] = useState<MoveRecord | null>(null);
  const [engineDeliberate, setEngineDeliberate] = useState(false);
  const [verdict, setVerdict] = useState<CoachVerdict | null>(null);
  const [verdictBlocking, setVerdictBlocking] = useState(false);
  const [hint, setHint] = useState<HintState | null>(null);
  const [pendingCheck, setPendingCheck] = useState<{ record: MoveRecord; before: PreAnalysis | null; history: string[] } | null>(null);

  const bump = useCallback(() => setVersion(v => v + 1), []);
  const tokenRef = useRef(0);
  const preAnalysisRef = useRef<PreAnalysis | null>(null);
  const clockRef = useRef({ w: 0, b: 0, since: Date.now(), turn: 'w' as Color });
  const [clockMs, setClockMs] = useState<{ w: number; b: number }>({ w: 0, b: 0 });

  // ------------------------------------------------------------- derived ---
  const pieces = useMemo(() => game.pieceMap(), [game, version]);
  const status = useMemo(() => game.status(), [game, version]);
  const moves = useMemo(() => game.moves, [game, version]);
  const lastMove = useMemo(() => {
    const last = game.lastMove;
    return last ? { from: last.from, to: last.to } : null;
  }, [game, version]);
  const checkSquare = useMemo(() => (game.isCheck() ? game.kingSquare(game.turn) : null), [game, version]);
  const opening = useMemo(() => lookupOpening(moves.map(m => m.san)), [moves]);
  const targets = useMemo(
    () => (selected ? game.legalTargets(selected) : []),
    [game, selected, version],
  );

  const level = useMemo(() => {
    const base = levelForElo(elo);
    return watch ? capLevelForWatch(base) : base;
  }, [elo, watch]);

  // Push the level into the engine whenever it changes.
  useEffect(() => {
    if (!engineReady) return;
    void setOptions(levelToUciOptions(level, supportedOptions)).catch(() => undefined);
  }, [engineReady, setOptions, supportedOptions, level]);

  useEffect(() => {
    if (!engineReady) return;
    void newGame().catch(() => undefined);
  }, [engineReady, newGame]);

  // --------------------------------------------------------------- clock ---
  useEffect(() => {
    const clock = clockRef.current;
    clock[clock.turn] += Date.now() - clock.since;
    clock.since = Date.now();
    clock.turn = game.turn;
    setClockMs({ w: clock.w, b: clock.b });
  }, [game, version]);

  useEffect(() => {
    const interval = setInterval(() => {
      const clock = clockRef.current;
      setClockMs({ ...clock, [clock.turn]: clock[clock.turn] + (Date.now() - clock.since) });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // ---------------------------------------------------------- persistence --
  useEffect(() => {
    if (!persist) return;
    if (moves.length === 0) return;
    saveJson(STORAGE_KEYS.lastGame, { pgn: game.pgn({ Event: 'AuroraChess' }), savedAt: Date.now() });
  }, [game, moves.length, persist, version]);

  // ------------------------------------------------------------- coaching --
  useEffect(() => {
    if (mode !== 'coach' || !coachEnabled || !engineReady) return;
    if (game.turn !== playerColor || game.status().over) return;
    const token = ++tokenRef.current;
    const fen = game.fen;
    const command = game.uciPositionCommand();
    void (async () => {
      try {
        const result = await search(command, { depth: coachDepth, movetimeMs: COACH_MOVETIME_MS }, 2);
        if (token !== tokenRef.current) return;
        const lines = groupByMultiPv(result.lines).filter(l => l.score);
        const top = lines[0];
        if (!top?.score) return;
        preAnalysisRef.current = {
          fen,
          cp: scoreToCp(top.score),
          bestLan: top.pv[0] ?? null,
          bestSan: top.pv[0] ? lanToSan(game, top.pv[0]) : null,
          pv: pvToSan(game, top.pv, 5),
          legalMoveCount: game.legalMoveCount(),
        };
      } catch {
        // Engine unavailable: coaching silently degrades to heuristics only.
      }
    })();
  }, [coachDepth, coachEnabled, engineReady, game, mode, playerColor, search, version]);

  useEffect(() => {
    if (!pendingCheck || mode !== 'coach' || !coachEnabled) {
      if (pendingCheck) setPendingCheck(null);
      return;
    }
    // If the player moved while the engine was still loading, keep the pending
    // check and grade it once the engine is up (this effect re-runs when
    // `engineReady` flips). Only a *failed* engine drops it, so the fallback
    // opponent can take over.
    if (!engineReady && !engineFailed) return;
    if (engineFailed) {
      setPendingCheck(null);
      return;
    }
    const token = ++tokenRef.current;
    const { record, before, history } = pendingCheck;
    const command = game.uciPositionCommand();
    void (async () => {
      let quality: MoveQuality = 'good';
      let lossCp = 0;
      let bestSan = before?.bestSan ?? null;
      let bestLan = before?.bestLan ?? null;
      let bestPv = before?.pv ?? [];
      try {
        if (before) {
          // Analyse the position *after* the move; its score is from the
          // opponent's point of view, so flip the sign back to the player's.
          const result = await search(command, { depth: coachDepth, movetimeMs: COACH_MOVETIME_MS }, 1);
          if (token === tokenRef.current) {
            const lines = groupByMultiPv(result.lines).filter(l => l.score);
            const top = lines[0];
            if (top?.score) {
              const afterForPlayer = -scoreToCp(top.score);
              lossCp = Math.max(0, before.cp - afterForPlayer);
              const input: ClassificationInput = {
                lossCp,
                winBefore: winProbability(before.cp),
                winAfter: winProbability(afterForPlayer),
                isBestMove: !!before.bestLan && before.bestLan === record.lan,
                onlyMove: before.legalMoveCount === 1,
                isBook: isBookMove(history),
              };
              quality = classifyMove(input);
            }
          }
        }
      } catch {
        // Fall back to a heuristic verdict when the engine cannot help.
        quality = 'good';
      }
      if (token !== tokenRef.current) return;

      const interrupted = coachEnabled && SEVERITY_RANK[quality] >= INTERRUPT_RANK[coachInterrupt];
      const nextVerdict: CoachVerdict = {
        ply: record.ply,
        san: record.san,
        lan: record.lan,
        quality,
        lossCp,
        bestSan,
        bestLan,
        bestPv,
        interrupted,
      };
      setVerdict(nextVerdict);
      setVerdictBlocking(interrupted);
      setPendingCheck(null);
    })();
  }, [coachDepth, coachEnabled, coachInterrupt, engineFailed, engineReady, game, mode, pendingCheck, playerColor, search]);

  // --------------------------------------------------------- engine reply --
  useEffect(() => {
    if (status.over) return;
    if (game.turn === playerColor) {
      // The player is to move again: make sure the spinner is off.
      setThinking(false);
      return;
    }
    if (pendingCheck || verdictBlocking) return;
    if (!engineReady && !engineFailed) return;
    const token = ++tokenRef.current;
    const levelNow = level;
    const history = game.moves.map(m => m.san);
    const command = game.uciPositionCommand();
    const ply = game.plyCount;
    setThinking(true);

    void (async () => {
      try {
        // 1. Opening book: instant, coherent, and free.
        const bookMoves = shouldUseBook(ply, levelNow) ? bookContinuations(history) : [];
        if (bookMoves.length) {
          const san = bookMoves[Math.floor(Math.random() * bookMoves.length)];
          await delay(220);
          if (token !== tokenRef.current) return;
          applyNotation(san);
          return;
        }

        // 2. Real search, then the human-like selection filter.
        if (engineReady) {
          const result = await search(
            command,
            { depth: levelNow.depth, movetimeMs: levelNow.movetimeMs },
            levelNow.multiPv,
          );
          if (token !== tokenRef.current) return;
          const candidates = candidatesFrom(result);
          if (candidates.length) {
            const selection = selectMove(candidates, levelNow);
            const parsed = parseUciMove(selection.move);
            if (parsed) {
              applyMove(parsed.from, parsed.to, parsed.promotion as PieceSymbol | undefined);
              setEngineDeliberate(selection.deliberate);
              return;
            }
          }
        }

        // 3. Fallback opponent when WASM is unavailable.
        const fallback = pickFallbackMove(game, levelNow);
        if (fallback && token === tokenRef.current) {
          applyNotation(fallback.move);
          setEngineDeliberate(fallback.deliberate);
        }
      } catch {
        const fallback = pickFallbackMove(game, levelNow);
        if (fallback && token === tokenRef.current) applyNotation(fallback.move);
      } finally {
        if (token === tokenRef.current) setThinking(false);
      }
    })();

    function applyNotation(san: string) {
      const parsed = parseUciMove(san);
      if (parsed) {
        applyMove(parsed.from, parsed.to, parsed.promotion as PieceSymbol | undefined);
        return;
      }
      // Book moves arrive as SAN.
      try {
        const record = game.moveByNotation(san);
        setEngineMove(record);
        bump();
      } catch {
        // ignore: the position moved on
      }
    }

    function applyMove(from: string, to: string, promo?: PieceSymbol) {
      try {
        const record = game.move({ from, to, promotion: promo });
        setEngineMove(record);
        bump();
      } catch {
        // ignore
      }
    }
    // The effect intentionally depends on the position version only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, playerColor, pendingCheck, verdictBlocking, engineReady, engineFailed, level, search, status.over]);

  // ------------------------------------------------------------ interaction --
  const select = useCallback((square: Square | null) => setSelected(square), []);

  const move = useCallback(
    (from: Square, to: Square) => {
      if (status.over) return;
      if (game.turn !== playerColor) return;
      if (game.needsPromotion(from, to)) {
        setPromotion({ from, to, color: game.turn });
        return;
      }
      finishMove(from, to, undefined);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, playerColor, status.over, version],
  );

  const finishMove = useCallback(
    (from: Square, to: Square, promo: PieceSymbol | undefined) => {
      const before = preAnalysisRef.current && preAnalysisRef.current.fen === game.fen ? preAnalysisRef.current : null;
      const history = game.moves.map(m => m.san);
      try {
        const record = game.move({ from, to, promotion: promo });
        setSelected(null);
        setPromotion(null);
        setHint(null);
        setVerdict(null);
        setVerdictBlocking(false);
        bump();
        if (mode === 'coach' && coachEnabled) setPendingCheck({ record, before, history: [...history, record.san] });
      } catch {
        setSelected(null);
        setPromotion(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bump, coachEnabled, game, mode, version],
  );

  const promote = useCallback(
    (piece: PieceSymbol) => {
      if (!promotion) return;
      finishMove(promotion.from, promotion.to, piece);
    },
    [finishMove, promotion],
  );

  const cancelPromotion = useCallback(() => {
    setPromotion(null);
    setSelected(null);
  }, []);

  const flip = useCallback(() => setOrientation(prev => (prev === 'w' ? 'b' : 'w')), []);

  const undo = useCallback(() => {
    if (!moves.length) return;
    game.clearEndOverride();
    if (game.turn === playerColor) {
      // Undo the engine's reply plus our move.
      game.undo();
      if (game.plyCount > 0 && game.turn !== playerColor) game.undo();
    } else {
      game.undo();
    }
    setVerdict(null);
    setVerdictBlocking(false);
    setPendingCheck(null);
    setHint(null);
    setSelected(null);
    bump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bump, game, moves.length, playerColor]);

  const reset = useCallback(() => {
    gameRef.current = new AuroraGame();
    setVerdict(null);
    setVerdictBlocking(false);
    setPendingCheck(null);
    setHint(null);
    setSelected(null);
    setPromotion(null);
    setEngineMove(null);
    preAnalysisRef.current = null;
    void newGame().catch(() => undefined);
    bump();
  }, [bump, newGame]);

  const resign = useCallback(() => {
    game.endGame('resign', playerColor === 'w' ? 'b' : 'w');
    bump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bump, game, playerColor]);

  const dismissVerdict = useCallback(() => setVerdictBlocking(false), []);

  const retryVerdict = useCallback(() => {
    undo();
  }, [undo]);

  const requestHint = useCallback(async () => {
    if (status.over || !engineReady) return;
    try {
      const result = await search(game.uciPositionCommand(), { depth: coachDepth, movetimeMs: HINT_MOVETIME_MS }, 1);
      const lines = groupByMultiPv(result.lines).filter(l => l.pv.length);
      const top = lines[0];
      if (!top) return;
      const parsed = parseUciMove(top.pv[0]);
      if (!parsed) return;
      setHint({
        from: parsed.from,
        to: parsed.to,
        san: lanToSan(game, top.pv[0]) ?? top.pv[0],
        pv: pvToSan(game, top.pv, 5),
      });
    } catch {
      // ignore
    }
    // `engineReady` must be a dependency: without it the callback captured the
    // pre-load value (false) and every hint click returned early.
  }, [coachDepth, engineReady, game, search, status.over]);

  const clearHint = useCallback(() => setHint(null), []);

  const pgn = useMemo(    () =>
      game.pgn({
        Event: 'AuroraChess',
        White: playerColor === 'w' ? 'Player' : `Engine ${level.elo}`,
        Black: playerColor === 'b' ? 'Player' : `Engine ${level.elo}`,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, level.elo, playerColor, version],
  );

  return {
    pieces,
    fen: game.fen,
    turn: game.turn,
    status,
    moves,
    lastMove,
    checkSquare,
    opening,
    selected,
    targets,
    promotion,
    orientation,
    select,
    move,
    promote,
    cancelPromotion,
    flip,
    undo,
    reset,
    resign,
    level,
    thinking,
    engineMove,
    engineDeliberate,
    verdict,
    verdictBlocking,
    dismissVerdict,
    retryVerdict,
    hint,
    requestHint,
    clearHint,
    clockMs,
    activeClock: status.over ? null : game.turn,
    pgn,
  };
}

interface PreAnalysis {
  fen: string;
  cp: number;
  bestLan: string | null;
  bestSan: string | null;
  pv: string[];
  legalMoveCount?: number;
}

export { PIECE_VALUE };
