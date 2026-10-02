'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createTranslator, DEFAULT_LOCALE, isLocale, type Locale, type Translate } from '@/lib/i18n';
import { ENGINE_ELO_DEFAULT } from '@/lib/engine/levels';
import { loadJson, saveJson, STORAGE_KEYS } from './persist';

export type ThemeChoice = 'dark' | 'light' | 'system';
export type InterruptLevel = 'inaccuracy' | 'mistake' | 'blunder';
/**
 * Watch board zoom, expressed as the number of files/ranks visible:
 * `8` = the whole board, `4` = the default 4x4 window, `2` = a 2x2 window.
 */
export type WatchZoom = 4 | 2 | 8;
/** `cburnett` is the lichess piece set, `aurora` the built-in geometric one. */
export type PieceSet = 'cburnett' | 'aurora';
export type BoardTheme = 'deepseek' | 'classic' | 'ice';

/** Bumped when a stored settings shape needs migrating. */
export const SETTINGS_VERSION = 2;

export interface Settings {
  /** Shape version of the persisted settings. */
  settingsVersion: number;
  locale: Locale;
  theme: ThemeChoice;
  /** Default engine strength for a new game. */
  elo: number;
  playerColor: 'w' | 'b' | 'random';
  coordinates: boolean;
  sound: boolean;
  /** How bad a move must be before the coach interrupts. */
  coachInterrupt: InterruptLevel;
  coachEnabled: boolean;
  watchZoom: WatchZoom;
  watchBatterySaver: boolean;
  /** Analysis depth for the coach (independent of engine playing strength). */
  coachDepth: number;
  pieceSet: PieceSet;
  boardTheme: BoardTheme;
  /** Collapses the top bar so the board gets the full height. */
  headerHidden: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  settingsVersion: SETTINGS_VERSION,
  locale: DEFAULT_LOCALE,
  theme: 'light',
  elo: ENGINE_ELO_DEFAULT,
  playerColor: 'w',
  coordinates: true,
  sound: true,
  coachInterrupt: 'mistake',
  coachEnabled: true,
  // 4 = a 4x4 window (~40px squares on a 192px watch), the legibility
  // recommendation from docs/reference/watch-ui-notes.md.
  watchZoom: 4,
  watchBatterySaver: true,
  coachDepth: 14,
  pieceSet: 'cburnett',
  boardTheme: 'deepseek',
  headerHidden: false,
};

/**
 * v1 stored `watchZoom` as a *scale factor* (2 meant a 4x4 window, and 8 — the
 * "whole board" option — scaled the board 8x so only one square was visible).
 * v2 stores the number of visible squares instead.
 */
function migrateStoredSettings(stored: Partial<Settings>): Partial<Settings> {
  const patch: Partial<Settings> = { ...stored };
  if ((stored.settingsVersion ?? 1) < SETTINGS_VERSION) {
    if (stored.watchZoom === 2) patch.watchZoom = 4;
    else if (stored.watchZoom === 4) patch.watchZoom = 2;
    else if (stored.watchZoom === 8) patch.watchZoom = 8;
  }
  patch.settingsVersion = SETTINGS_VERSION;
  return patch;
}

interface SettingsContextValue {
  settings: Settings;
  ready: boolean;
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
  t: Translate;
  locale: Locale;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function resolveLocale(value: string | undefined): Locale {
  if (isLocale(value)) return value;
  return DEFAULT_LOCALE;
}

export function SettingsProvider({ children, initial }: { children: ReactNode; initial?: Partial<Settings> }) {
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS, ...initial });
  const [ready, setReady] = useState(false);

  // Hydrate from storage after mount so SSR markup stays deterministic.
  useEffect(() => {
    // Read the raw stored object (empty fallback = no merge) so the migration
    // can tell a v1 payload from a v2 one.
    const stored = loadJson<Partial<Settings>>(STORAGE_KEYS.settings, {});
    const browserLocale = resolveLocale(typeof navigator !== 'undefined' ? navigator.language.slice(0, 2) : undefined);
    setSettings(prev => ({ ...prev, ...migrateStoredSettings(stored), locale: stored.locale ?? browserLocale }));
    setReady(true);
  }, []);

  // Apply the theme to <html> so CSS variables switch everywhere at once.
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const resolved =
        settings.theme === 'system'
          ? window.matchMedia('(prefers-color-scheme: light)').matches
            ? 'light'
            : 'dark'
          : settings.theme;
      root.dataset.theme = resolved;
    };
    apply();
    if (settings.theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [settings.theme]);

  useEffect(() => {
    document.documentElement.lang = settings.locale === 'zh' ? 'zh-CN' : 'en';
  }, [settings.locale]);

  // Board colours/highlights are chosen independently of the UI theme.
  useEffect(() => {
    document.documentElement.dataset.board = settings.boardTheme;
  }, [settings.boardTheme]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      saveJson(STORAGE_KEYS.settings, next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    saveJson(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      ready,
      update,
      reset,
      locale: settings.locale,
      t: createTranslator(settings.locale),
    }),
    [settings, ready, update, reset],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}

/** Convenience hook for components that only need the translator. */
export function useT(): Translate {
  return useSettings().t;
}
