/**
 * SSR-safe localStorage helpers.
 *
 * Every read is wrapped: keys can contain corrupt JSON (older versions of the
 * app), and localStorage throws in private-mode Safari.
 */

export const STORAGE_KEYS = {
  settings: 'aurorachess.settings.v1',
  lastGame: 'aurorachess.lastGame.v1',
  stats: 'aurorachess.stats.v1',
  review: 'aurorachess.review.v1',
} as const;

export function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && !Array.isArray(fallback) && fallback && typeof fallback === 'object') {
      // Shallow merge so newly added settings get their defaults.
      return { ...(fallback as object), ...(parsed as object) } as T;
    }
    return parsed;
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: the app still works, it just forgets.
  }
}

export function removeKey(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
