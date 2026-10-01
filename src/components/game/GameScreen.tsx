'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Board } from '@/components/board/Board';
import { CoachPanel } from '@/components/game/CoachPanel';
import { ClockDisplay, EloSlider, EngineStatusBadge, EvalBar, MoveList, SegmentedControl, whiteScoreOf } from '@/components/game/widgets';
import { Chip, Panel } from '@/components/ui/Primitives';
import { openingName } from '@/lib/coach/openings';
import type { Color, PieceSymbol } from '@/lib/chess/types';
import { parseUciMove } from '@/lib/engine/uci';
import { useGameController, type GameMode, type InterruptLevel } from '@/lib/game/useGameController';
import { useEngineActions, useEngineState } from '@/lib/engine/react';
import { useSettings } from '@/lib/store/settings';

function resolveColor(choice: 'w' | 'b' | 'random'): Color {
  if (choice === 'random') return Math.random() < 0.5 ? 'w' : 'b';
  return choice;
}

export function GameScreen({ mode }: { mode: GameMode }) {
  const { t, settings, update } = useSettings();
  const engineState = useEngineState();
  const { restart: restartEngine } = useEngineActions();
  const [playerColor, setPlayerColor] = useState<Color>(() => resolveColor(settings.playerColor));
  const [copied, setCopied] = useState(false);
  const [bestArrow, setBestArrow] = useState<{ from: string; to: string } | null>(null);

  const controller = useGameController({
    mode,
    elo: settings.elo,
    playerColor,
    coachEnabled: mode === 'coach' && settings.coachEnabled,
    coachInterrupt: settings.coachInterrupt,
    coachDepth: settings.coachDepth,
    persist: true,
  });

  const { reset, moves } = controller;
  // Restarting when the player switches sides keeps the board honest.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    reset();
  }, [playerColor, reset]);

  // A new best-move arrow should not survive the next move.
  useEffect(() => {
    setBestArrow(null);
  }, [moves.length]);

  const showBest = useCallback(() => {
    if (!controller.verdict?.bestLan) return;
    const parsed = parseUciMove(controller.verdict.bestLan);
    if (parsed) setBestArrow({ from: parsed.from, to: parsed.to });
  }, [controller.verdict]);

  const copyPgn = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(controller.pgn);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }, [controller.pgn]);

  const openingLabel = useMemo(
    () => (controller.opening ? openingName(controller.opening.opening, settings.locale) : null),
    [controller.opening, settings.locale],
  );

  const resultText = controller.status.over
    ? controller.status.winner === null
      ? t('play.draw')
      : controller.status.winner === playerColor
        ? t('play.youWon')
        : t('play.youLost')
    : null;

  const engineName = `Stockfish ${controller.level.elo}`;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Chip tone={controller.turn === playerColor ? 'accent' : 'default'}>
              {controller.turn === playerColor ? t('play.yourMove') : t('play.engineThinking')}
            </Chip>
            {openingLabel && <Chip tone="default">{t('coach.openingName', { name: openingLabel })}</Chip>}
          </div>
          <EngineStatusBadge
            status={engineState.status}
            progressPercent={engineState.progress?.percent}
            failed={engineState.failed}
            onRetry={restartEngine}
          />
        </div>

        <div className="flex gap-3">
          <div style={{ width: '2.6rem', flexShrink: 0 }}>
            <EvalBar
              score={whiteScoreOf(engineState.liveInfo, controller.turn)}
              turn={controller.turn}
              orientation={controller.orientation}
            />
          </div>
          <div className="relative" style={{ flex: 1, minWidth: 0 }}>
            <Board
              pieces={controller.pieces}
              orientation={controller.orientation}
              movableColor={controller.status.over ? null : playerColor}
              turn={controller.turn}
              lastMove={controller.lastMove}
              checkSquare={controller.checkSquare}
              selected={controller.selected}
              targets={controller.targets}
              hint={controller.hint ? { from: controller.hint.from, to: controller.hint.to } : bestArrow}
              threat={null}
              coordinates={settings.coordinates}
              promotion={controller.promotion}
              onSelect={controller.select}
              onMove={controller.move}
              onPromote={piece => controller.promote(piece as PieceSymbol)}
            />

            {resultText && (
              <div
                className="animate-rise"
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'color-mix(in oklab, var(--surface) 82%, transparent)',
                  borderRadius: '0.75rem',
                  backdropFilter: 'blur(4px)',
                }}
              >
                <div className="surface-strong flex flex-col items-center gap-2 p-5 text-center">
                  <span className="text-lg font-bold">{resultText}</span>
                  {controller.status.reason && (
                    <span className="text-muted text-sm">{t(`result.${controller.status.reason}`)}</span>
                  )}
                  <button type="button" className="btn btn-primary mt-1" onClick={controller.reset}>
                    {t('play.playAgain')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <ClockDisplay
            whiteMs={controller.clockMs.w}
            blackMs={controller.clockMs.b}
            active={controller.activeClock}
            orientation={controller.orientation}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={controller.undo} disabled={!moves.length || controller.thinking}>
              {t('play.undo')}
            </button>
            <button type="button" className="btn" onClick={controller.flip}>
              {t('play.flip')}
            </button>
            <button type="button" className="btn" onClick={() => void controller.requestHint()} disabled={!engineState.ready || controller.thinking}>
              {t('play.hint')}
            </button>
            <button type="button" className="btn btn-danger" onClick={controller.resign} disabled={controller.status.over}>
              {t('play.resign')}
            </button>
            <button type="button" className="btn btn-primary" onClick={controller.reset}>
              {t('play.newGame')}
            </button>
          </div>
        </div>

        {!engineState.ready && !engineState.failed && (
          <p className="text-muted text-xs">{t('play.engineLoading')}</p>
        )}
        {engineState.failed && <p className="text-xs" style={{ color: '#fbbf24' }}>{t('play.engineOffline')}</p>}
      </div>

      <aside className="flex flex-col gap-3">
        {mode === 'coach' && (
          <CoachPanel
            verdict={controller.verdict}
            hint={controller.hint}
            onRetry={controller.retryVerdict}
            onDismiss={controller.dismissVerdict}
            onShowBest={showBest}
            onHint={() => void controller.requestHint()}
            thinking={controller.thinking}
            engineReady={engineState.ready}
          />
        )}

        <Panel title={t('play.strength')}>
          <EloSlider elo={settings.elo} onChange={elo => update({ elo })} disabled={controller.thinking} />
        </Panel>

        <Panel title={t('play.yourColor')}>
          <SegmentedControl<Color>
            value={playerColor}
            onChange={setPlayerColor}
            options={[
              { value: 'w', label: t('play.white') },
              { value: 'b', label: t('play.black') },
            ]}
          />
        </Panel>

        {mode === 'coach' && (
          <Panel title={t('coach.interveneLevel')}>
            <SegmentedControl<InterruptLevel>
              value={settings.coachInterrupt}
              onChange={coachInterrupt => update({ coachInterrupt })}
              options={[
                { value: 'inaccuracy', label: t('coach.levelInaccuracy') },
                { value: 'mistake', label: t('coach.levelMistake') },
                { value: 'blunder', label: t('coach.levelBlunder') },
              ]}
            />
          </Panel>
        )}

        <Panel
          title={t('play.moveList')}
          actions={
            <button type="button" className="btn btn-ghost" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={() => void copyPgn()}>
              {copied ? t('common.copied') : 'PGN'}
            </button>
          }
        >
          <MoveList moves={moves} maxHeight="14rem" />
          <div className="text-muted mt-3 flex items-center justify-between gap-2 text-xs">
            <span className="truncate">{engineName}</span>
            <span className="shrink-0">
              {moves.length} {t('common.moves')}
            </span>
          </div>
        </Panel>
      </aside>
    </div>
  );
}
