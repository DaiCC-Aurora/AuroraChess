'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createTranslator, DEFAULT_LOCALE, isLocale, type Locale, type Translate } from '@/lib/i18n';
import { ENGINE_ELO_DEFAULT } from '@/lib/engine/levels';
import { loadJson, saveJson, STORAGE_KEYS } from './persist';

export type ThemeChoice = 'dark' | 'light' | 'system';
export type InterruptLevel = 'inaccuracy' | 'mistake' | 'blunder';
export type WatchZoom = 4 | 2 | 8;
/** `cburnett` is the lichess piece set, `aurora` the built-in geometric one. */
export type PieceSet = 'cburnett' | 'aurora';
export type BoardTheme = 'deepseek' | 'classic' | 'ice';

export interface Settings {
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
}

export const DEFAULT_SETTINGS: Settings = {
  locale: DEFAULT_LOCALE,
  theme: 'light',
  elo: ENGINE_ELO_DEFAULT,
  playerColor: 'w',
  coordinates: true,
  sound: true,
  coachInterrupt: 'mistake',
  coachEnabled: true,
  // 2 = a 4x4 window (~40px squares on a 192px watch), the legibility
  // recommendation from docs/reference/watch-ui-notes.md.
  watchZoom: 2,
  watchBatterySaver: true,
  coachDepth: 14,
  pieceSet: 'cburnett',
  boardTheme: 'deepseek',
};

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
    const stored = loadJson<Settings>(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
    const browserLocale = resolveLocale(typeof navigator !== 'undefined' ? navigator.language.slice(0, 2) : undefined);
    // Stored value wins, otherwise fall back to the browser language.
    setSettings(prev => ({ ...prev, ...stored, locale: stored.locale ?? browserLocale }));
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
