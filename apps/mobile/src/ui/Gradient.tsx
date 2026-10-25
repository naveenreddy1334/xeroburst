import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { GRADIENT } from '../theme/tokens';

/** The signature gradient (110deg, #9BFB00 to #4A7900) as a fill. Put it inside a clipped, rounded parent. */
export function GradientFill({ opacity = 1, style, vertical }: { opacity?: number; style?: StyleProp<ViewStyle>; vertical?: boolean }) {
  const id = 'g' + useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width="100%" height="100%" preserveAspectRatio="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Defs>
          <LinearGradient id={id} x1={vertical ? '0' : '0'} y1={vertical ? '0' : '0.17'} x2={vertical ? '0' : '1'} y2={vertical ? '1' : '0.83'}>
            {(vertical ? [{ offset: 0, color: '#9BFB00' }, { offset: 1, color: '#4A7900' }] : GRADIENT.stops).map((s) => (
              <Stop key={s.offset} offset={s.offset} stopColor={s.color} stopOpacity={opacity} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** Soft ambient violet and blue light behind a screen or a selected panel. */
export function Ambient({ a, b }: { a: string; b: string }) {
  const id = 'a' + useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" preserveAspectRatio="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Defs>
          <RadialGradient id={id + 'a'} cx="0.85" cy="0" rx="0.9" ry="0.55" fx="0.85" fy="0">
            <Stop offset="0" stopColor={a} stopOpacity={1} />
            <Stop offset="1" stopColor={a} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={id + 'b'} cx="0" cy="0.7" rx="0.8" ry="0.5" fx="0" fy="0.7">
            <Stop offset="0" stopColor={b} stopOpacity={1} />
            <Stop offset="1" stopColor={b} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}a)`} />
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}b)`} />
      </Svg>
    </View>
  );
}
