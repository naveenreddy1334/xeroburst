// The artifact's surface recipes (.glass, .glass-hi, .glass-lo, .neo, .neo-in, .inp), as functions of the design unit `u`
// so shadows scale with the screen exactly like the design. Web gets the real CSS; native gets a flat fill plus an elevation.

import { Platform } from 'react-native';
import { C, getThemeMode } from './tokens';

const web = Platform.OS === 'web';
const dark = () => getThemeMode() === 'dark';
const f = (n: number) => `${Math.round(n * 10) / 10}px`;

/** Frosted panel with a soft light edge and a deep drop shadow (.glass). */
export function glassSurface(u: number, hi = false): object {
  // Native: a flat opaque-enough fill and a hairline edge. Blurred shadows and elevation on every card made scrolling stutter.
  if (!web) return { backgroundColor: dark() ? (hi ? 'rgb(18,22,12)' : 'rgb(16,19,11)') : '#FFFFFF', borderWidth: 1, borderColor: dark() ? 'rgba(155,251,0,0.16)' : C.border };
  if (!dark()) return { backgroundColor: 'rgba(255,255,255,0.97)', boxShadow: `inset 0 0 0 1px rgba(40,70,0,.2), 0 ${f(u * 0.5)} ${f(u * 1.4)} ${f(-u * 0.5)} rgba(40,70,0,.35)` };
  return hi
    ? { backgroundColor: 'rgba(12,15,8,.9)', boxShadow: `inset 0 1px 0 rgba(210,255,122,.15), 0 ${f(u * 1.6)} ${f(u * 3.2)} ${f(-u * 1.4)} #000` }
    : {
        backgroundColor: 'rgba(16,19,11,.8)',
        boxShadow: `inset 1px 1px 0 rgba(210,255,122,.11), inset -1px -1px 0 rgba(0,0,0,.35), 0 ${f(u * 0.6)} ${f(u * 1.6)} ${f(-u * 0.9)} rgba(0,0,0,.5)`,
      };
}

/** Quiet inner tile (.glass-lo): a lime wash and a hairline of light on top. */
export function glassLo(): object {
  if (!dark()) return { backgroundColor: 'rgba(40,70,0,0.08)' };
  return web ? { backgroundColor: 'rgba(155,251,0,.05)', boxShadow: 'inset 0 1px 0 rgba(210,255,122,.05)' } : { backgroundColor: 'rgba(155,251,0,.05)' };
}

/** Raised control (.neo): soft gradient, light edge top-left, dark edge below. */
export function neoSurface(u: number): object {
  if (!web) return { backgroundColor: dark() ? 'rgb(30,36,19)' : '#FFFFFF', borderWidth: 1, borderColor: dark() ? 'rgba(155,251,0,0.18)' : C.border };
  if (!dark()) return { backgroundColor: '#FFFFFF', boxShadow: `inset 0 0 0 1px rgba(40,70,0,.25), 0 ${f(u * 0.4)} ${f(u * 0.9)} ${f(-u * 0.4)} rgba(40,70,0,.35)` };
  return {
    backgroundImage: 'linear-gradient(145deg, rgba(44,58,22,.92), rgba(16,22,8,.92))',
    boxShadow: `${f(u * 0.3)} ${f(u * 0.4)} ${f(u * 0.9)} rgba(0,0,0,.65), ${f(-u * 0.2)} ${f(-u * 0.2)} ${f(u * 0.7)} rgba(155,251,0,.07), inset 0 1px 0 rgba(210,255,122,.1)`,
  };
}

/** Pressed-in well (.neo-in / .inp): inputs, search fields, gauge tiles. */
export function neoIn(u: number): object {
  if (!web) return { backgroundColor: dark() ? 'rgba(6,10,2,0.7)' : 'rgba(40,70,0,0.08)', borderWidth: 1, borderColor: dark() ? 'transparent' : C.border };
  if (!dark()) return { backgroundColor: 'rgba(40,70,0,.08)', boxShadow: `inset 0 0 0 1px rgba(40,70,0,.22), inset ${f(u * 0.2)} ${f(u * 0.25)} ${f(u * 0.6)} rgba(40,70,0,.18)` };
  return { boxShadow: `inset ${f(u * 0.25)} ${f(u * 0.3)} ${f(u * 0.7)} rgba(0,0,0,.55), inset ${f(-u * 0.2)} ${f(-u * 0.2)} ${f(u * 0.6)} rgba(155,251,0,.06)` };
}

/** Glow under the gradient pill and primary buttons. */
export function glowBox(u: number, kind: 'pill' | 'btn' | 'bar' = 'btn'): object {
  if (!web) return {};
  if (kind === 'pill') return { boxShadow: `0 0 ${f(u * 1.2)} ${f(-u * 0.25)} rgba(155,251,0,.55)` };
  if (kind === 'bar') return { boxShadow: `inset 0 1px 0 rgba(255,255,255,.2), 0 ${f(u * 0.4)} ${f(u * 1)} ${f(-u * 0.4)} rgba(74,121,0,.7)` };
  return { boxShadow: `inset 0 1px 0 rgba(255,255,255,.26), 0 ${f(u * 0.7)} ${f(u * 1.3)} ${f(-u * 0.8)} #4A7900` };
}