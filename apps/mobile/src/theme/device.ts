import { Platform, useWindowDimensions } from 'react-native';
import { usePrefs } from '../state/prefs';

export type DeviceKind = 'phone' | 'tablet' | 'tv';

export interface Device {
  kind: DeviceKind;
  tv: boolean;
  /** side navigation (tablet, TV, wide web) instead of bottom tabs */
  wide: boolean;
  width: number;
  height: number;
  landscape: boolean;
  /** grid columns for card grids */
  cols: number;
  /** multiplier for type and spacing */
  ui: number;
  /** the design unit: everything in the XeroBurst layout is a multiple of this (TV 18px at 1280 wide, phone 15px at 390 wide) */
  u: number;
  /** content padding that keeps TV content inside the safe area */
  gutter: number;
}

/** ?tv=1 previews the TV layout in a browser. It is read once (the router later drops the query) and remembered; ?tv=0 clears it. */
const WEB_TV = ((): boolean => {
  if (Platform.OS !== 'web') return false;
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? '').get('tv');
    if (q === '1') globalThis.localStorage?.setItem('nboard.tv', '1');
    if (q === '0') globalThis.localStorage?.removeItem('nboard.tv');
    return q === '1' || (q !== '0' && globalThis.localStorage?.getItem('nboard.tv') === '1');
  } catch {
    return false;
  }
})();

export function useDevice(): Device {
  const { width, height } = useWindowDimensions();
  const tvPreview = usePrefs((s) => s.tvPreview);
  const large = usePrefs((s) => s.textSize === 'large');
  const tv = Platform.isTV || tvPreview || WEB_TV;
  const short = Math.min(width, height);
  const kind: DeviceKind = tv ? 'tv' : short >= 600 ? 'tablet' : 'phone';
  const wide = tv || width >= 900 || (kind === 'tablet' && width > height);
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
  const u = (kind === 'phone' ? clamp((width / 390) * 15, 13, 17) : clamp((width / 1280) * 18, 13, 20)) * (large ? 1.12 : 1);
  const ui = u / 15;
  const cols = tv ? 4 : width >= 1100 ? 4 : width >= 700 ? 2 : 1;
  return {
    kind,
    tv,
    wide,
    width,
    height,
    landscape: width > height,
    cols,
    ui,
    u,
    gutter: Math.round(u * (wide ? 1.25 : 1)),
  };
}
