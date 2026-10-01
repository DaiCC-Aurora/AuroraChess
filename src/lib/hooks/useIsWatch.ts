'use client';

import { useEffect, useState } from 'react';

export interface Viewport {
  width: number;
  height: number;
}

/**
 * Watch / round-screen detection.
 *
 * There is no reliable CSS media feature for round displays (`@media
 * (shape: round)` is unimplemented in every browser — see
 * docs/reference/watch-ui-notes.md), so detection is geometric:
 *
 *  - the viewport is tiny (<= 320 CSS px on the short side), or
 *  - it is roughly square (a round watch clips a square viewport) and small.
 *
 * `?watch=1` forces the watch layout, `?watch=0` disables it.
 */
export function useIsWatch(threshold = 500): boolean {
  const [isWatch, setIsWatch] = useState(false);

  useEffect(() => {
    const evaluate = () => {
      const params = new URLSearchParams(window.location.search);
      const forced = params.get('watch');
      if (forced === '0') {
        setIsWatch(false);
        return;
      }
      if (forced === '1') {
        setIsWatch(true);
        return;
      }
      const width = window.innerWidth;
      const height = window.innerHeight;
      const short = Math.min(width, height);
      const long = Math.max(width, height);
      const squareness = short / long;
      setIsWatch(short <= 320 || (short <= threshold && squareness >= 0.78));
    };
    evaluate();
    window.addEventListener('resize', evaluate);
    window.addEventListener('orientationchange', evaluate);
    return () => {
      window.removeEventListener('resize', evaluate);
      window.removeEventListener('orientationchange', evaluate);
    };
  }, [threshold]);

  return isWatch;
}

export function useViewport(): Viewport {
  const [viewport, setViewport] = useState<Viewport>({ width: 0, height: 0 });
  useEffect(() => {
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return viewport;
}

/** True when the user asked for reduced motion. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(media.matches);
    const listener = () => setReduced(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);
  return reduced;
}

/** Pauses expensive work (engine polling) while the page is hidden. */
export function useVisibility(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const listener = () => setVisible(document.visibilityState === 'visible');
    listener();
    document.addEventListener('visibilitychange', listener);
    return () => document.removeEventListener('visibilitychange', listener);
  }, []);
  return visible;
}
