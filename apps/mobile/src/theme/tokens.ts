// Design tokens. XeroBurst in the nBoard Pro look: near-black graphite surfaces, one hot orange accent,
// mint for success and personal bests, amber for caution, red for errors. Orange is an accent (actions,
// active states, targets), never a wash over the whole screen. Locked is shown with an icon and the word.

// Dark Violet design system. Dark is the primary look: near-black surfaces with translucent violet-tinted glass,
// Dark Violet (#9400D3) for brand actions and active states, cyan and blue only for analytics. A complete light
// theme uses the same brand colour. Every screen reads colours through `C`, which resolves to the active theme
// when it is read, so nothing else in the app needs to know which theme is on.

export type ThemeMode = 'dark' | 'light';

export const BRAND = {
  primary: '#9400D3',
  highlight: '#B84AFF',
  electric: '#672BFF',
  blue: '#315BFF',
  cyan: '#35C7FF',
} as const;

/** Signature gradient: linear-gradient(110deg, #9400D3 0%, #672BFF 55%, #315BFF 100%) */
export const GRADIENT = {
  angle: 110,
  stops: [
    { offset: 0, color: '#9400D3' },
    { offset: 0.55, color: '#672BFF' },
    { offset: 1, color: '#315BFF' },
  ],
  css: 'linear-gradient(110deg, #9400D3 0%, #672BFF 55%, #315BFF 100%)',
} as const;

type Palette = Record<'bg' | 'bg2' | 'surface' | 'surface2' | 'surface3' | 'border' | 'borderStrong' | 'text' | 'sub' | 'faint' | 'primary' | 'highlight' | 'primaryDim' | 'secondary' | 'electric' | 'blue' | 'cyan' | 'success' | 'warning' | 'danger' | 'locked' | 'lockedText' | 'onPrimary' | 'scrim' | 'glowA' | 'glowB' | 'tint' | 'tintHi' | 'idle' | 'navIdle' | 'grid', string>;

const DARK: Palette = {
  bg: '#050608',
  bg2: '#0A0C12',
  surface: 'rgba(20,16,30,0.68)',
  surface2: 'rgba(34,26,52,0.74)',
  surface3: 'rgba(48,36,72,0.86)',
  border: 'rgba(190,130,255,0.07)',
  borderStrong: 'rgba(190,130,255,0.22)',
  text: '#F5F3FF',
  sub: '#A2AEC5',
  faint: '#8A94AB',
  primary: BRAND.primary,
  /** brand colour for text and icons on dark surfaces (the base violet is too dim to read small) */
  highlight: BRAND.highlight,
  primaryDim: 'rgba(148,0,211,0.20)',
  secondary: BRAND.cyan,
  electric: BRAND.electric,
  blue: BRAND.blue,
  cyan: BRAND.cyan,
  success: '#27E5B5',
  warning: '#FFB454',
  danger: '#FF4778',
  locked: '#5E5873',
  lockedText: '#948FA8',
  onPrimary: '#FFFFFF',
  scrim: 'rgba(3,2,8,0.8)',
  glowA: 'rgba(148,0,211,0.30)',
  glowB: 'rgba(49,91,255,0.16)',
  tint: 'rgba(255,255,255,0.05)',
  tintHi: 'rgba(255,255,255,0.10)',
  idle: '#d9d4ee',
  navIdle: '#7f879c',
  grid: 'rgba(190,130,255,0.09)',
};

const LIGHT: Palette = {
  bg: '#E9E3F5',
  bg2: '#DFD7F0',
  surface: 'rgba(255,255,255,0.96)',
  surface2: '#FFFFFF',
  surface3: '#F1EBFB',
  border: 'rgba(80,40,140,0.22)',
  borderStrong: 'rgba(80,40,140,0.42)',
  text: '#140D22',
  sub: '#43395C',
  faint: '#5A5075',
  primary: BRAND.primary,
  highlight: '#7A00B0',
  primaryDim: 'rgba(148,0,211,0.12)',
  secondary: '#0A7BA6',
  electric: BRAND.electric,
  blue: BRAND.blue,
  cyan: '#0A7BA6',
  success: '#087A5B',
  warning: '#8A5600',
  danger: '#C21842',
  locked: '#B3AAC9',
  lockedText: '#5A5075',
  onPrimary: '#FFFFFF',
  scrim: 'rgba(24,12,40,0.5)',
  glowA: 'rgba(148,0,211,0.10)',
  glowB: 'rgba(49,91,255,0.08)',
  tint: 'rgba(80,40,140,0.07)',
  tintHi: 'rgba(80,40,140,0.14)',
  idle: '#3A2F55',
  navIdle: '#5A5075',
  grid: 'rgba(80,40,140,0.16)',
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
  dark: { quick: '#B84AFF', memory: '#35C7FF', hunt: '#FFB454', endure: '#FF4778' },
  light: { quick: '#8A00C4', memory: '#0A7BA6', hunt: '#8A5600', endure: '#C21842' },
};
export const GAME_ACCENT = {} as Readonly<(typeof ACCENTS)['dark']>;
(Object.keys(ACCENTS.dark) as (keyof (typeof ACCENTS)['dark'])[]).forEach((k) => {
  Object.defineProperty(GAME_ACCENT, k, { get: () => ACCENTS[mode][k], enumerable: true });
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
  return L > 0.3 ? '#0A0A0C' : '#FFFFFF';
};

/** Soft raised-glass look: a faint light edge top-left, a dark edge bottom-right, a deep drop shadow. No outline. */
export const neo = (depth: 'card' | 'chip' = 'card'): object => {
  const big = depth === 'card';
  if (typeof document !== 'undefined') {
    const dark = getThemeMode() === 'dark';
    return {
      boxShadow: dark
        ? `inset 1px 1px 0 rgba(220,190,255,0.10), inset -1px -1px 0 rgba(0,0,0,0.35), -3px -3px 12px rgba(190,130,255,0.04), ${big ? '8px 14px 28px -8px' : '4px 8px 16px -6px'} rgba(0,0,0,0.7)`
        : `inset 1px 1px 0 rgba(255,255,255,0.9), 0 ${big ? '10px 28px -10px' : '6px 16px -8px'} rgba(80,40,140,0.28)`,
    };
  }
  return { shadowColor: '#000', shadowOpacity: getThemeMode() === 'dark' ? 0.5 : 0.18, shadowRadius: big ? 16 : 10, shadowOffset: { width: 0, height: big ? 8 : 5 }, elevation: big ? 6 : 3 };
};
