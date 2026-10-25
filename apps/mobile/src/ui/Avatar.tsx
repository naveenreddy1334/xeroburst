import { Image, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useId } from 'react';
import { Txt } from './Txt';
import { C } from '../theme/tokens';
import { usePhoto } from '../state/photos';

/** Initials on the design's violet-to-navy disc with a faint inner ring. No photos are stored. */
export function Avatar({ name, size = 44, fs, photoKey }: { name: string; size?: number; fs?: number; photoKey?: string | null }) {
  const photo = usePhoto(photoKey);
  const id = 'av' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const parts = name.trim().replace(/^(coach|admin|dr|mr|ms|mrs)\.?\s+/i, '').split(/\s+/).filter(Boolean);
  const initials = ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1]![0]! : '')).toUpperCase();
  const r = size / 2;
  if (photo) return <Image accessibilityElementsHidden source={{ uri: photo }} style={{ width: size, height: size, borderRadius: r, borderWidth: 1, borderColor: C.borderStrong }} />;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no" style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#2c3a10" />
            <Stop offset="1" stopColor="#10150a" />
          </LinearGradient>
        </Defs>
        <Circle cx={r} cy={r} r={r - 0.5} fill={`url(#${id})`} stroke={C.borderStrong} strokeWidth={1} />
      </Svg>
      <Txt v="bodyStrong" size={(fs ?? size * 0.34)} color="#D2FF7A" style={{ lineHeight: size * 0.5 }}>{initials}</Txt>
    </View>
  );
}
