import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform } from 'react-native';
import { usePrefs } from '../state/prefs';

export const useNative = Platform.OS !== 'web';

/** System reduce-motion setting, or the in-app switch. */
export function useReducedMotion(): boolean {
  const pref = usePrefs((s) => s.reduceMotion);
  const [sys, setSys] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setSys(v)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setSys(v));
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return pref || sys;
}

/** A value that eases between 0 and 1 (150 to 300 ms is the range the spec asks for). */
export function useTransition(on: boolean, ms = 200): Animated.Value {
  const v = useRef(new Animated.Value(on ? 1 : 0)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    Animated.timing(v, { toValue: on ? 1 : 0, duration: reduced ? 0 : ms, easing: Easing.out(Easing.quad), useNativeDriver: useNative }).start();
  }, [on, ms, reduced, v]);
  return v;
}

/** A looping 0..1..0 pulse for glowing targets. Stays still with reduce-motion. */
export function usePulse(active: boolean, period = 1200): Animated.Value {
  const v = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!active || reduced) {
      v.setValue(active ? 1 : 0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: period / 2, easing: Easing.inOut(Easing.quad), useNativeDriver: useNative }),
        Animated.timing(v, { toValue: 0, duration: period / 2, easing: Easing.inOut(Easing.quad), useNativeDriver: useNative }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, period, reduced, v]);
  return v;
}

/** Count-up number for the result screen. */
export function useCountUp(target: number | null, ms = 700, decimals = 0): string {
  const [shown, setShown] = useState(target ?? 0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (target === null) return;
    if (reduced) {
      setShown(target);
      return;
    }
    const start = Date.now();
    const from = 0;
    let raf: ReturnType<typeof setTimeout>;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(from + (target - from) * eased);
      if (t < 1) raf = setTimeout(tick, Platform.OS === 'web' ? 16 : 50);
    };
    tick();
    return () => clearTimeout(raf);
  }, [target, ms, reduced]);
  return target === null ? '--' : shown.toFixed(decimals);
}

/** 0 -> 1 with an ease-out, once when the component appears (and again when `key` changes). Jumps to 1 with reduce-motion. */
export function useDrawIn(ms = 800, key: unknown = 0): number {
  // Phones: re-rendering a chart 60 times a second is what made the app feel slow, so charts appear fully drawn.
  const reduced = useReducedMotion() || Platform.OS !== 'web';
  const [t, setT] = useState(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      setT(1);
      return;
    }
    const start = Date.now();
    let h: ReturnType<typeof setTimeout>;
    setT(0);
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / ms);
      setT(1 - Math.pow(1 - p, 3));
      if (p < 1) h = setTimeout(tick, 16);
    };
    tick();
    return () => clearTimeout(h);
  }, [ms, key, reduced]);
  return t;
}

/** 0 -> 1 along a CSS-style cubic-bezier(x1,y1,x2,y2), restarting when `key` changes. Used for the chart reveal (2.4 s, .45 .05 .25 1). */
export function useReveal(ms: number, key: unknown, bez: [number, number, number, number] = [0.45, 0.05, 0.25, 1]): number {
  const reduced = useReducedMotion() || Platform.OS !== 'web';
  const [t, setT] = useState(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      setT(1);
      return;
    }
    const [x1, y1, x2, y2] = bez;
    const bx = (s: number) => 3 * (1 - s) * (1 - s) * s * x1 + 3 * (1 - s) * s * s * x2 + s * s * s;
    const by = (s: number) => 3 * (1 - s) * (1 - s) * s * y1 + 3 * (1 - s) * s * s * y2 + s * s * s;
    const ease = (x: number) => {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 18; i++) {
        const mid = (lo + hi) / 2;
        if (bx(mid) < x) lo = mid;
        else hi = mid;
      }
      return by((lo + hi) / 2);
    };
    const start = Date.now();
    let h: ReturnType<typeof setTimeout>;
    setT(0);
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / ms);
      setT(ease(p));
      if (p < 1) h = setTimeout(tick, 16);
    };
    tick();
    return () => clearTimeout(h);
  }, [ms, key, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  return t;
}
