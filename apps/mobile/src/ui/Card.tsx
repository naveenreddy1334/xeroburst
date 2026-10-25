import { Platform, Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import type { ReactNode } from 'react';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { C, glow } from '../theme/tokens';
import { glassLo, glassSurface } from '../theme/surfaces';
import { useDevice } from '../theme/device';
import { useFocus } from './useFocus';

interface Props {
  children: ReactNode;
  onPress?: () => void;
  accent?: string;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  /** glass is the main panel, lo is the quiet inner tile, hi the raised sheet */
  tone?: 'glass' | 'lo' | 'hi';
  /** padding in design units (default 1.25u, the design's p-5) */
  pad?: number;
  disabled?: boolean;
  preferredFocus?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

/** The light that falls on a glass panel from its top-left corner (.glass::before). */
export function GlassLight() {
  // Native: a gradient SVG on every card is costly and nearly invisible; the web keeps the soft light.
  if (Platform.OS !== 'web') return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 999 }]}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="gl" cx="14%" cy="-12%" rx="110%" ry="60%" fx="14%" fy="-12%">
            <Stop offset="0" stopColor="rgb(230,255,160)" stopOpacity={0.09} />
            <Stop offset="0.58" stopColor="rgb(230,255,160)" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#gl)" />
      </Svg>
    </View>
  );
}

export function Card({ children, onPress, accent, style, padded = true, tone = 'glass', pad = 1.25, disabled, preferredFocus, accessibilityLabel, testID }: Props) {
  const { focused, handlers } = useFocus();
  const { u } = useDevice();
  const radius = tone === 'lo' ? u * 1.25 : u * 1.6;
  const base: StyleProp<ViewStyle> = [
    { borderRadius: radius, overflow: 'hidden', minWidth: 0 },
    tone === 'lo' ? glassLo() : glassSurface(u, tone === 'hi'),
    padded && { padding: u * pad },
    focused ? { borderColor: accent ?? '#FFFFFF', borderWidth: u * 0.18, transform: [{ scale: 1.03 }], ...glow(accent ?? C.primary, 18, 0.6) } : null,
    style,
  ];
  const inner = (
    <>
      {tone === 'glass' ? <GlassLight /> : null}
      {children}
    </>
  );
  if (!onPress) return <View testID={testID} style={base}>{inner}</View>;
  return (
    <Pressable
      testID={testID}
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hasTVPreferredFocus={preferredFocus}
      focusable={!disabled}
      {...handlers}
      style={({ pressed }) => [base, pressed && !disabled ? { transform: [{ scale: 0.98 }] } : null]}
    >
      {inner}
    </Pressable>
  );
}
