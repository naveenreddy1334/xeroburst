// Design tokens. XeroBurst in Lime, Olive and Black: lime #9BFB00 for actions, active states and numbers, olive #4A7900
// for fills and the end of gradients, black #010100 for the ground. Everything else is a tint of these, plus error red
// and warning amber. Dark and light. Every screen reads colours through `C`, which resolves to the active theme when it is
// read, so nothing else in the app needs to know which theme is on.

export type ThemeMode = 'dark' | 'light';

export const BRAND = {
  primary: '#9BFB00',
  highlight: '#9BFB00',
  electric: '#4A7900',
  blue: '#4A7900',
  cyan: '#D2FF7A',
} as const;

/** Signature gradient: linear-gradient(110deg, #9BFB00 0%, #4A7900 100%) */
export const GRADIENT = {
  angle: 110,
  stops: [
    { offset: 0, color: '#9BFB00' },
    { offset: 1, color: '#4A7900' },
  ],
  css: 'linear-gradient(110deg, #9BFB00 0%, #4A7900 100%)',
} as const;

type Palette = Record<'bg' | 'bg2' | 'surface' | 'surface2' | 'surface3' | 'border' | 'borderStrong' | 'text' | 'sub' | 'faint' | 'primary' | 'highlight' | 'primaryDim' | 'secondary' | 'electric' | 'blue' | 'cyan' | 'success' | 'warning' | 'danger' | 'locked' | 'lockedText' | 'onPrimary' | 'scrim' | 'glowA' | 'glowB' | 'tint' | 'tintHi' | 'idle' | 'navIdle' | 'grid', string>;

/** Lime (#9BFB00), olive (#4A7900) and black (#010100). */
const DARK: Palette = {
  bg: '#010100',
  bg2: '#050800',
  surface: 'rgba(8,12,2,0.78)',
  surface2: 'rgba(20,32,2,0.82)',
  surface3: 'rgba(30,48,4,0.9)',
  border: 'rgba(155,251,0,0.20)',
  borderStrong: 'rgba(155,251,0,0.38)',
  text: '#F3FAE6',
  sub: '#A8BC85',
  faint: '#8A9E6A',
  primary: BRAND.primary,
  highlight: BRAND.highlight,
  primaryDim: 'rgba(155,251,0,0.18)',
  secondary: BRAND.cyan,
  electric: BRAND.electric,
  blue: BRAND.blue,
  cyan: BRAND.cyan,
  success: '#9BFB00',
  warning: '#FFBD59',
  danger: '#FF5263',
  locked: '#4F5640',
  lockedText: '#8A9E6A',
  /** text on lime fills: black */
  onPrimary: '#010100',
  scrim: 'rgba(0,0,0,0.8)',
  glowA: 'rgba(155,251,0,0.20)',
  glowB: 'rgba(74,121,0,0.14)',
  tint: 'rgba(255,255,255,0.05)',
  tintHi: 'rgba(155,251,0,0.12)',
  idle: '#DDF2B8',
  navIdle: '#7C8666',
  grid: 'rgba(155,251,0,0.09)',
};


/** Light theme: pale lime-tinted paper, black text, olive for text and icons on paper, lime for fills. */
const LIGHT: Palette = {
  bg: '#EEF6DC',
  bg2: '#E3EFC8',
  surface: 'rgba(255,255,255,0.94)',
  surface2: '#FFFFFF',
  surface3: '#F2F8E4',
  border: 'rgba(40,70,0,0.20)',
  borderStrong: 'rgba(40,70,0,0.40)',
  text: '#0B1400',
  sub: '#364618',
  faint: '#53643A',
  primary: BRAND.primary,
  /** brand colour for text and icons on paper: the lime is too light to read there, so the dark olive is used */
  highlight: '#3C6200',
  primaryDim: 'rgba(74,121,0,0.14)',
  secondary: '#4A7900',
  electric: BRAND.electric,
  blue: BRAND.blue,
  cyan: '#4A7900',
  success: '#2F6B00',
  warning: '#8A5600',
  danger: '#C21842',
  locked: '#B9C7A0',
  lockedText: '#53643A',
  onPrimary: '#010100',
  scrim: 'rgba(10,20,0,0.5)',
  glowA: 'rgba(155,251,0,0.22)',
  glowB: 'rgba(74,121,0,0.10)',
  tint: 'rgba(40,70,0,0.07)',
  tintHi: 'rgba(40,70,0,0.14)',
  idle: '#2A3A10',
  navIdle: '#53643A',
  grid: 'rgba(40,70,0,0.16)',
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
  dark: { quick: '#9BFB00', memory: '#D2FF7A', hunt: '#FFBD59', endure: '#FF5263' },
  light: { quick: '#4A7900', memory: '#6E9400', hunt: '#8A5600', endure: '#C21842' },
};
export const GAME_ACCENT = {} as Readonly<(typeof ACCENTS)['dark']>;
(Object.keys(ACCENTS.dark) as (keyof (typeof ACCENTS)['dark'])[]).forEach((k) => {
  Object.defineProperty(GAME_ACCENT, k, { get: () => ACCENTS[mode][k], enumerable: true });
});

/** Chart and accent line colours: bright lime on dark, dark olive on light paper. Read at render time like `C`. */
const INKS = {
  dark: { line: '#9BFB00', line2: '#D2FF7A', fill: 'rgba(155,251,0,.20)', fill2: 'rgba(210,255,122,.10)' },
  light: { line: '#3C6200', line2: '#6E9400', fill: 'rgba(60,98,0,.18)', fill2: 'rgba(110,148,0,.10)' },
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
        ? `inset 1px 1px 0 rgba(210,255,122,0.10), inset -1px -1px 0 rgba(0,0,0,0.35), -3px -3px 12px rgba(155,251,0,0.04), ${big ? '8px 14px 28px -8px' : '4px 8px 16px -6px'} rgba(0,0,0,0.7)`
        : `inset 1px 1px 0 rgba(255,255,255,0.9), 0 ${big ? '10px 28px -10px' : '6px 16px -8px'} rgba(40,70,0,0.28)`,
    };
  }
  return { shadowColor: '#000', shadowOpacity: getThemeMode() === 'dark' ? 0.5 : 0.18, shadowRadius: big ? 16 : 10, shadowOffset: { width: 0, height: big ? 8 : 5 }, elevation: big ? 6 : 3 };
};