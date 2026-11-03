// Design tokens. XeroBurst in Gold Fade: gold #DEB35C for actions, active states and numbers, deep gold #8A6422
// for fills and the end of gradients, black #0A0803 for the ground. Everything else is a tint of these, plus error red
// and warning amber. Dark and light. Every screen reads colours through `C`, which resolves to the active theme when it is
// read, so nothing else in the app needs to know which theme is on.

export type ThemeMode = 'dark' | 'light';

export const BRAND = {
  primary: '#DEB35C',
  highlight: '#DEB35C',
  electric: '#8A6422',
  blue: '#8A6422',
  cyan: '#F3D48A',
} as const;

/** Signature gradient: linear-gradient(110deg, #DEB35C 0%, #8A6422 100%) */
export const GRADIENT = {
  angle: 110,
  stops: [
    { offset: 0, color: '#DEB35C' },
    { offset: 1, color: '#8A6422' },
  ],
  css: 'linear-gradient(110deg, #DEB35C 0%, #8A6422 100%)',
} as const;

type Palette = Record<'bg' | 'bg2' | 'surface' | 'surface2' | 'surface3' | 'border' | 'borderStrong' | 'text' | 'sub' | 'faint' | 'primary' | 'highlight' | 'primaryDim' | 'secondary' | 'electric' | 'blue' | 'cyan' | 'success' | 'warning' | 'danger' | 'locked' | 'lockedText' | 'onPrimary' | 'scrim' | 'glowA' | 'glowB' | 'tint' | 'tintHi' | 'idle' | 'navIdle' | 'grid', string>;

/** Gold (#DEB35C), deep gold (#8A6422) and black (#0A0803). */
const DARK: Palette = {
  bg: '#0A0803',
  bg2: '#110D07',
  surface: 'rgba(20,16,9,0.78)',
  surface2: 'rgba(32,26,14,0.82)',
  surface3: 'rgba(44,34,16,0.9)',
  border: 'rgba(222,179,92,0.20)',
  borderStrong: 'rgba(222,179,92,0.38)',
  text: '#F7F3EA',
  sub: '#B9AA86',
  faint: '#9A8C68',
  primary: BRAND.primary,
  highlight: BRAND.highlight,
  primaryDim: 'rgba(222,179,92,0.18)',
  secondary: BRAND.cyan,
  electric: BRAND.electric,
  blue: BRAND.blue,
  cyan: BRAND.cyan,
  success: '#8FD18A',
  warning: '#FF9A4D',
  danger: '#FF5263',
  locked: '#574D38',
  lockedText: '#9A8C68',
  /** text on lime fills: black */
  onPrimary: '#0A0803',
  scrim: 'rgba(0,0,0,0.8)',
  glowA: 'rgba(222,179,92,0.20)',
  glowB: 'rgba(138,100,34,0.14)',
  tint: 'rgba(255,255,255,0.05)',
  tintHi: 'rgba(222,179,92,0.12)',
  idle: '#F1E2BC',
  navIdle: '#8A7E5E',
  grid: 'rgba(222,179,92,0.09)',
};


/** Light theme: pale lime-tinted paper, black text, olive for text and icons on paper, lime for fills. */
const LIGHT: Palette = {
  bg: '#F6EFDC',
  bg2: '#EDE2C4',
  surface: 'rgba(255,255,255,0.94)',
  surface2: '#FFFFFF',
  surface3: '#F9F3E2',
  border: 'rgba(90,64,18,0.20)',
  borderStrong: 'rgba(90,64,18,0.40)',
  text: '#140E04',
  sub: '#4A3A18',
  faint: '#6B5A34',
  primary: BRAND.primary,
  /** brand colour for text and icons on paper: the lime is too light to read there, so the dark olive is used */
  highlight: '#7A5516',
  primaryDim: 'rgba(138,100,34,0.14)',
  secondary: '#8A6422',
  electric: BRAND.electric,
  blue: BRAND.blue,
  cyan: '#8A6422',
  success: '#2F6B00',
  warning: '#8A5600',
  danger: '#C21842',
  locked: '#D3C69F',
  lockedText: '#6B5A34',
  onPrimary: '#0A0803',
  scrim: 'rgba(20,14,4,0.5)',
  glowA: 'rgba(222,179,92,0.22)',
  glowB: 'rgba(138,100,34,0.10)',
  tint: 'rgba(90,64,18,0.07)',
  tintHi: 'rgba(90,64,18,0.14)',
  idle: '#3A2A0C',
  navIdle: '#6B5A34',
  grid: 'rgba(90,64,18,0.16)',
};

const PALETTES: Record<ThemeMode, Palette> = { dark: DARK, light: LIGHT };
let mode: ThemeMode = 'dark';

/** Called once per render of the root layout, before any screen renders. */
export function setThemeMode(m: ThemeMode) {
  mode = m;
}
export const getThemeMode = (): ThemeMode => mode;

/** Colours of the active theme. Read at render time; never cache a value in a module-level constant. */
export const C = {} as Readonly<Palette>;
(Object.keys(DARK) as (keyof Palette)[]).forEach((k) => {
  Object.defineProperty(C, k, { get: () => PALETTES[mode][k], enumerable: true });
});

/** Game accents come from the same palette so the whole app reads as one brand. */
const ACCENTS = {
  dark: { quick: '#DEB35C', memory: '#F6DE9E', hunt: '#C8963A', endure: '#E9B04A' },
  light: { quick: '#8A6422', memory: '#A8802F', hunt: '#7A5516', endure: '#96691C' },
};
export const GAME_ACCENT = {} as Readonly<(typeof ACCENTS)['dark']>;
(Object.keys(ACCENTS.dark) as (keyof (typeof ACCENTS)['dark'])[]).forEach((k) => {
  Object.defineProperty(GAME_ACCENT, k, { get: () => ACCENTS[mode][k], enumerable: true });
});

/** Chart and accent line colours: bright lime on dark, dark olive on light paper. Read at render time like `C`. */
const INKS = {
  dark: { line: '#DEB35C', line2: '#F3D48A', fill: 'rgba(222,179,92,.20)', fill2: 'rgba(243,212,138,.10)' },
  light: { line: '#7A5516', line2: '#A8802F', fill: 'rgba(122,85,22,.18)', fill2: 'rgba(168,128,47,.10)' },
};
export const INK = {} as Readonly<(typeof INKS)['dark']>;
(Object.keys(INKS.dark) as (keyof (typeof INKS)['dark'])[]).forEach((k) => {
  Object.defineProperty(INK, k, { get: () => INKS[mode][k], enumerable: true });
});

/** Frosted glass on the web (backdrop-filter). Native surfaces stay translucent; the colour alone keeps text readable. */
export const glass = (blur = 18): object =>
  typeof document !== 'undefined' ? { backdropFilter: `blur(${blur}px) saturate(140%)`, WebkitBackdropFilter: `blur(${blur}px) saturate(140%)` } : {};

/** 4-point grid */
export const S = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 } as const;

export const R = { sm: 10, md: 14, lg: 20, xl: 26, pill: 999 } as const;

export const F = {
  display: 'Manrope_800ExtraBold',
  displaySemi: 'Manrope_700Bold',
  body: 'Manrope_500Medium',
  bodyMed: 'Manrope_500Medium',
  bodySemi: 'Manrope_700Bold',
  mono: 'Manrope_600SemiBold',
  monoBold: 'Manrope_800ExtraBold',
} as const;

/** Soft glow instead of hard shadows. */
export function glow(color: string, radius = 14, opacity = 0.55) {
  return {
    shadowColor: color,
    shadowOpacity: opacity,
    shadowRadius: radius,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  } as const;
}

export const alpha = (hex: string, a: number): string => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** Readable text colour on top of a filled colour: dark text on amber / orange, white on red. */
export const onColor = (hex: string): string => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.3 ? '#000000' : '#FFFFFF';
};

/** Soft raised-glass look: a faint light edge top-left, a dark edge bottom-right, a deep drop shadow. No outline. */
export const neo = (depth: 'card' | 'chip' = 'card'): object => {
  const big = depth === 'card';
  if (typeof document !== 'undefined') {
    const dark = getThemeMode() === 'dark';
    return {
      boxShadow: dark
        ? `inset 1px 1px 0 rgba(243,212,138,0.10), inset -1px -1px 0 rgba(0,0,0,0.35), -3px -3px 12px rgba(222,179,92,0.04), ${big ? '8px 14px 28px -8px' : '4px 8px 16px -6px'} rgba(0,0,0,0.7)`
        : `inset 1px 1px 0 rgba(255,255,255,0.9), 0 ${big ? '10px 28px -10px' : '6px 16px -8px'} rgba(90,64,18,0.28)`,
    };
  }
  return { shadowColor: '#000', shadowOpacity: getThemeMode() === 'dark' ? 0.5 : 0.18, shadowRadius: big ? 16 : 10, shadowOffset: { width: 0, height: big ? 8 : 5 }, elevation: big ? 6 : 3 };
};
