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
  if (!web) return { backgroundColor: dark() ? (hi ? 'rgb(22,17,36)' : 'rgb(24,19,38)') : '#FFFFFF', borderWidth: 1, borderColor: dark() ? 'rgba(190,130,255,0.16)' : C.border };
  if (!dark()) return { backgroundColor: 'rgba(255,255,255,0.97)', boxShadow: `inset 0 0 0 1px rgba(80,40,140,.2), 0 ${f(u * 0.5)} ${f(u * 1.4)} ${f(-u * 0.5)} rgba(80,40,140,.35)` };
  return hi
    ? { backgroundColor: 'rgba(16,12,26,.80)', backdropFilter: 'blur(28px) saturate(170%)', WebkitBackdropFilter: 'blur(28px) saturate(170%)', boxShadow: `inset 0 1px 0 rgba(200,210,255,.15), 0 ${f(u * 1.6)} ${f(u * 3.2)} ${f(-u * 1.4)} #000` }
    : {
        backgroundColor: 'rgba(20,16,30,.68)',
        backdropFilter: 'blur(18px) saturate(150%)',
        WebkitBackdropFilter: 'blur(18px) saturate(150%)',
        boxShadow: `inset 1px 1px 0 rgba(220,190,255,.11), inset -1px -1px 0 rgba(0,0,0,.35), ${f(-u * 0.25)} ${f(-u * 0.25)} ${f(u * 0.8)} rgba(190,130,255,.045), ${f(u * 0.5)} ${f(u * 0.9)} ${f(u * 1.8)} ${f(-u * 0.4)} rgba(0,0,0,.7)`,
      };
}

/** Quiet inner tile (.glass-lo): a violet wash and a hairline of light on top. */
export function glassLo(): object {
  if (!dark()) return { backgroundColor: 'rgba(80,40,140,0.08)' };
  return web ? { backgroundColor: 'rgba(190,130,255,.05)', boxShadow: 'inset 0 1px 0 rgba(200,210,255,.05)' } : { backgroundColor: 'rgba(190,130,255,.05)' };
}

/** Raised control (.neo): soft gradient, light edge top-left, dark edge below. */
export function neoSurface(u: number): object {
  if (!web) return { backgroundColor: dark() ? 'rgb(38,29,58)' : '#FFFFFF', borderWidth: 1, borderColor: dark() ? 'rgba(190,130,255,0.18)' : C.border };
  if (!dark()) return { backgroundColor: '#FFFFFF', boxShadow: `inset 0 0 0 1px rgba(80,40,140,.25), 0 ${f(u * 0.4)} ${f(u * 0.9)} ${f(-u * 0.4)} rgba(80,40,140,.35)` };
  return {
    backgroundImage: 'linear-gradient(145deg, rgba(42,32,66,.92), rgba(18,14,30,.92))',
    boxShadow: `${f(u * 0.3)} ${f(u * 0.4)} ${f(u * 0.9)} rgba(0,0,0,.65), ${f(-u * 0.2)} ${f(-u * 0.2)} ${f(u * 0.7)} rgba(190,130,255,.07), inset 0 1px 0 rgba(220,190,255,.1)`,
  };
}

/** Pressed-in well (.neo-in / .inp): inputs, search fields, gauge tiles. */
export function neoIn(u: number): object {
  if (!web) return { backgroundColor: dark() ? 'rgba(10,8,18,0.7)' : 'rgba(80,40,140,0.08)', borderWidth: 1, borderColor: dark() ? 'transparent' : C.border };
  if (!dark()) return { backgroundColor: 'rgba(80,40,140,.08)', boxShadow: `inset 0 0 0 1px rgba(80,40,140,.22), inset ${f(u * 0.2)} ${f(u * 0.25)} ${f(u * 0.6)} rgba(80,40,140,.18)` };
  return { boxShadow: `inset ${f(u * 0.25)} ${f(u * 0.3)} ${f(u * 0.7)} rgba(0,0,0,.55), inset ${f(-u * 0.2)} ${f(-u * 0.2)} ${f(u * 0.6)} rgba(190,130,255,.06)` };
}

/** Glow under the gradient pill and primary buttons. */
export function glowBox(u: number, kind: 'pill' | 'btn' | 'bar' = 'btn'): object {
  if (!web) return {};
  if (kind === 'pill') return { boxShadow: `0 0 ${f(u * 1.2)} ${f(-u * 0.25)} rgba(148,0,211,.6)` };
  if (kind === 'bar') return { boxShadow: `inset 0 1px 0 rgba(255,255,255,.2), 0 ${f(u * 0.4)} ${f(u * 1)} ${f(-u * 0.4)} rgba(103,43,255,.7)` };
  return { boxShadow: `inset 0 1px 0 rgba(255,255,255,.26), 0 ${f(u * 0.7)} ${f(u * 1.3)} ${f(-u * 0.8)} #672BFF` };
}
