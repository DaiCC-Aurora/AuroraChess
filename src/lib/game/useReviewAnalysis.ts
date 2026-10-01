'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { AuroraGame } from '@/lib/chess/game';
import type { Color, MoveQuality } from '@/lib/chess/types';
import { classifyMove, groupByMultiPv, scoreToCp, winProbability } from '@/lib/engine/analysis';
import { useEngineActions } from '@/lib/engine/react';
import { isBookMove } from '@/lib/coach/openings';
import { lanToSan } from './pv';

export interface ReviewEntry {
  /** 0-based ply index of the move being judged. */
  ply: number;
  san: string;
  color: Color;
  quality: MoveQuality;
  lossCp: number;
  bestSan: string | null;
  /** Position evaluation after the move, from the mover's point of view. */
  cpAfterMover: number;
  fen: string;
}

export interface ReviewStats {
  accuracy: Record<Color, number>;
  counts: Record<Color, Record<MoveQuality, number>>;
  worstPlies: number[];
}

export interface ReviewAnalysis {
  entries: ReviewEntry[];
  stats: ReviewStats | null;
  progress: number;
  running: boolean;
  start: (pgn: string, depth?: number) => Promise<void>;
  cancel: () => void;
}

const EMPTY_COUNTS: Record<MoveQuality, number> = {
  book: 0,
  best: 0,
  excellent: 0,
  good: 0,
  forced: 0,
  inaccuracy: 0,
  mistake: 0,
  blunder: 0,
};

/**
 * Sequential full-game analysis.
 *
 * One pass over the game: every position is searched once (score + best move),
 * and the loss of move *i* is `score[i] + score[i+1]` because consecutive
 * scores are reported from opposite points of view. That halves the number of
 * engine calls compared to naive before/after evaluations.
 */
export function useReviewAnalysis(): ReviewAnalysis {
  const { search, stop } = useEngineActions();
  const [entries, setEntries] = useState<ReviewEntry[]>([]);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const cancelRef = useRef(false);

  const cancel = useCallback(() => {
    cancelRef.current = true;
    stop();
    setRunning(false);
  }, [stop]);

  const start = useCallback(
    async (pgn: string, depth = 12) => {
      let game: AuroraGame;
      try {
        game = AuroraGame.fromPgn(pgn);
      } catch {
        return;
      }
      const moves = game.moves;
      if (!moves.length) return;

      cancelRef.current = false;
      setRunning(true);
      setEntries([]);
      setProgress(0);

      const scores: number[] = [];
      const bestMoves: (string | null)[] = [];
      const fens: string[] = [];

      const replay = new AuroraGame();
      const commands: string[] = [];
      for (let i = 0; i <= moves.length; i++) {
        commands.push(replay.uciPositionCommand());
        fens.push(replay.fen);
        if (i < moves.length) replay.moveByNotation(moves[i].lan);
      }

      let legalCounts: number[] = [];
      const counter = new AuroraGame();
      for (let i = 0; i < moves.length; i++) {
        legalCounts.push(counter.legalMoveCount());
        counter.moveByNotation(moves[i].lan);
      }

      try {
        for (let i = 0; i <= moves.length; i++) {
          if (cancelRef.current) break;
          const result = await search(commands[i], { depth, movetimeMs: 350 }, 2);
          const lines = groupByMultiPv(result.lines).filter(line => line.score);
          const top = lines[0];
          scores.push(top?.score ? scoreToCp(top.score) : 0);
          bestMoves.push(top?.pv[0] ?? null);
          setProgress(Math.round(((i + 1) / (moves.length + 1)) * 100));
        }
      } catch {
        // Engine hiccup: report what we have.
      }

      if (cancelRef.current || scores.length < 2) {
        setRunning(false);
        return;
      }

      const history: string[] = [];
      const judged: ReviewEntry[] = [];
      for (let i = 0; i < moves.length; i++) {
        const move = moves[i];
        const scoreBefore = scores[i] ?? 0;
        const scoreNext = scores[i + 1] ?? 0;
        const cpAfterMover = -scoreNext;
        const lossCp = Math.max(0, scoreBefore - cpAfterMover);
        history.push(move.san);
        const probe = new AuroraGame(move.before);
        const quality = classifyMove({
          lossCp,
          winBefore: winProbability(scoreBefore),
          winAfter: winProbability(cpAfterMover),
          isBestMove: bestMoves[i] === move.lan,
          onlyMove: legalCounts[i] === 1,
          isBook: isBookMove(history),
        });
        judged.push({
          ply: i,
          san: move.san,
          color: move.color,
          quality,
          lossCp,
          bestSan: bestMoves[i] ? lanToSan(probe, bestMoves[i] as string) : null,
          cpAfterMover,
          fen: move.after,
        });
      }

      setEntries(judged);
      setRunning(false);
    },
    [search],
  );

  const stats = useMemo<ReviewStats | null>(() => {
    if (!entries.length) return null;
    const counts: Record<Color, Record<MoveQuality, number>> = {
      w: { ...EMPTY_COUNTS },
      b: { ...EMPTY_COUNTS },
    };
    const weights: Record<Color, number[]> = { w: [], b: [] };
    for (const entry of entries) {
      counts[entry.color][entry.quality] += 1;
      if (entry.quality !== 'book' && entry.quality !== 'forced') {
        weights[entry.color].push(QUALITY_WEIGHT[entry.quality]);
      }
    }
    const accuracy: Record<Color, number> = { w: 100, b: 100 };
    for (const color of ['w', 'b'] as Color[]) {
      const list = weights[color];
      accuracy[color] = list.length ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 1000) / 10 : 100;
    }
    const worstPlies = entries
      .filter(entry => entry.quality === 'blunder' || entry.quality === 'mistake')
      .sort((a, b) => b.lossCp - a.lossCp)
      .slice(0, 5)
      .map(entry => entry.ply);
    return { accuracy, counts, worstPlies };
  }, [entries]);

  return { entries, stats, progress, running, start, cancel };
}

const QUALITY_WEIGHT: Record<MoveQuality, number> = {
  book: 1,
  best: 1,
  excellent: 0.95,
  good: 0.85,
  forced: 0.9,
  inaccuracy: 0.6,
  mistake: 0.35,
  blunder: 0,
};
