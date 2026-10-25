import { StyleSheet, Text as RNText } from 'react-native';
import type { TextProps, TextStyle, StyleProp } from 'react-native';
import { C, F } from '../theme/tokens';
import { useDevice } from '../theme/device';

export type TxtVariant = 'display' | 'h1' | 'h2' | 'h3' | 'body' | 'bodyStrong' | 'small' | 'label' | 'mono' | 'num';

const base = (): Record<TxtVariant, TextStyle> => ({
  display: { fontFamily: F.display, fontSize: 38, lineHeight: 44, letterSpacing: -0.6, color: C.text },
  h1: { fontFamily: F.display, fontSize: 30, lineHeight: 36, letterSpacing: -0.5, color: C.text },
  h2: { fontFamily: F.displaySemi, fontSize: 20, lineHeight: 26, letterSpacing: -0.2, color: C.text },
  h3: { fontFamily: F.bodySemi, fontSize: 16, lineHeight: 22, color: C.text },
  body: { fontFamily: F.body, fontSize: 15, lineHeight: 22, color: C.text },
  bodyStrong: { fontFamily: F.bodySemi, fontSize: 15, lineHeight: 22, color: C.text },
  small: { fontFamily: F.body, fontSize: 13, lineHeight: 18, color: C.sub },
  label: { fontFamily: F.mono, fontSize: 11, lineHeight: 15, textTransform: 'uppercase', letterSpacing: 1, color: C.sub },
  mono: { fontFamily: F.mono, fontSize: 14, lineHeight: 20, color: C.text, fontVariant: ['tabular-nums'] },
  num: { fontFamily: F.monoBold, fontSize: 28, lineHeight: 34, color: C.text, fontVariant: ['tabular-nums'] },
});

interface Props extends TextProps {
  v?: TxtVariant;
  color?: string;
  align?: TextStyle['textAlign'];
  size?: number;
  style?: StyleProp<TextStyle>;
}

export function Txt({ v = 'body', color, align, size, style, ...rest }: Props) {
  const { ui } = useDevice();
  const b = base()[v];
  const fs = (size ?? (b.fontSize as number)) * ui;
  const merged = StyleSheet.flatten([
    b,
    { fontSize: fs, lineHeight: Math.round(((b.lineHeight as number) / (b.fontSize as number)) * fs) },
    color ? { color } : null,
    align ? { textAlign: align } : null,
    style,
  ]) as TextStyle;
  // Manrope has long descenders (g, y, p). A line box shorter than 1.3 times the font size cuts them off,
  // most visibly on one-line titles, so the line height never goes below that.
  const size2 = (merged.fontSize as number) ?? fs;
  const minLine = Math.ceil(size2 * 1.3);
  if (typeof merged.lineHeight !== 'number' || merged.lineHeight < minLine) merged.lineHeight = minLine;
  return <RNText {...rest} style={merged} />;
}