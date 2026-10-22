// Game and module poster: dark glass with one accent colour. Everything is centred: icon tile, title, a small tag for what it
// trains, one line of description, and a round play button (or a pill such as "Empty for now").

import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useId } from 'react';
import type { IconName } from '@nboard/shared';
import { C, alpha } from '../theme/tokens';
import { glassLo, glassSurface } from '../theme/surfaces';
import { useDevice } from '../theme/device';
import { Icon } from './Icon';
import { GlassLight } from './Card';
import { Txt } from './Txt';
import { useFocus } from './useFocus';

export const POSTER_COLORS: Record<string, [string, string]> = {
  quick: ['#35C7FF', '#0a1f3a'],
  memory: ['#B84AFF', '#240a3a'],
  hunt: ['#FF4778', '#2e0f1b'],
  endure: ['#315BFF', '#0d1a4a'],
};

interface Props {
  title: string;
  sub: string;
  /** what it trains, shown as a small pill under the title (e.g. "Reflex & speed") */
  tag?: string;
  colors: [string, string];
  icon: IconName;
  /** pill instead of the play button, and a dimmed poster */
  locked?: string;
  onPress?: () => void;
  testID?: string;
  preferredFocus?: boolean;
}

export function Poster({ title, sub, tag, colors, icon, locked, onPress, testID, preferredFocus }: Props) {
  const { u, tv } = useDevice();
  const { focused, handlers } = useFocus();
  const id = 'p' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const [c0, c1] = colors;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${tag ? tag + '. ' : ''}${sub}${locked ? '. ' + locked : ''}`}
      hasTVPreferredFocus={preferredFocus}
      {...handlers}
      style={({ pressed }) => [
        { minHeight: u * (tv ? 18 : 15), borderRadius: u * 1.6, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', padding: u, paddingVertical: u * 1.25, gap: u * 0.5, opacity: locked ? 0.55 : 1 },
        glassSurface(u),
        focused ? { borderWidth: u * 0.2, borderColor: '#FFFFFF', transform: [{ scale: 1.07 }] } : pressed ? { transform: [{ scale: 0.96 }] } : null,
      ]}
    >
      <GlassLight />
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <RadialGradient id={id + 'r'} cx="0%" cy="0%" rx="110%" ry="85%" fx="0%" fy="0%">
              <Stop offset="0" stopColor={c0} stopOpacity={0.3} />
              <Stop offset="0.62" stopColor={c0} stopOpacity={0} />
            </RadialGradient>
            <LinearGradient id={id + 'l'} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0.4" stopColor={c1} stopOpacity={0} />
              <Stop offset="1" stopColor={c1} stopOpacity={0.75} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}r)`} />
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}l)`} />
        </Svg>
      </View>
      <View pointerEvents="none" style={{ width: u * 3.6, height: u * 3.6, borderRadius: u * 1.1, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(c0, 0.18) }}>
        <Icon name={icon} size={u * 2.2} color={c0} strokeWidth={1.8} />
      </View>
      <View style={{ alignItems: 'center', gap: u * 0.25 }}>
        <Txt v="h2" size={17.25} numberOfLines={2} style={{ fontFamily: 'Manrope_600SemiBold', letterSpacing: -0.2, lineHeight: u * 1.45, textAlign: 'center' }}>{title}</Txt>
        {tag ? (
          <View style={{ borderRadius: 999, paddingHorizontal: u * 0.7, paddingVertical: u * 0.15, backgroundColor: alpha(c0, 0.16) }}>
            <Txt v="small" size={11.2} color={c0} style={{ fontFamily: 'Manrope_700Bold', textAlign: 'center' }}>{tag}</Txt>
          </View>
        ) : null}
        <Txt v="small" size={12.75} numberOfLines={3} style={{ textAlign: 'center' }}>{sub}</Txt>
      </View>
      {locked ? (
        <View style={[{ borderRadius: 999, paddingHorizontal: u * 0.75, paddingVertical: u * 0.25 }, glassLo()]}>
          <Txt v="small" size={11.7} color={C.text} style={{ fontFamily: 'Manrope_600SemiBold' }}>{locked}</Txt>
        </View>
      ) : (
        <View style={[{ width: u * 2.5, height: u * 2.5, borderRadius: u * 1.25, alignItems: 'center', justifyContent: 'center' }, glassLo()]}>
          <Svg width={u} height={u} viewBox="0 0 24 24" style={{ marginLeft: u * 0.125 }}>
            <Path d="M8 5v14l11-7z" fill={C.text} />
          </Svg>
        </View>
      )}
    </Pressable>
  );
}