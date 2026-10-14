// The sign-in family (Login, Connect, Forgot) in the design's layout: a glass card, and on TV a panel with three rings.

import { useId } from 'react';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { Screen } from './Screen';
import { Card } from './Card';
import { Txt } from './Txt';
import { X } from './Bits';
import { F } from '../theme/tokens';
import { C } from '../theme/tokens';
import { useDevice } from '../theme/device';
import { useFocus } from './useFocus';

const RG: [string, string][] = [['#35C7FF', '#315BFF'], ['#B84AFF', '#672BFF'], ['#8fb0ff', '#315BFF']];

function AuthRing({ v, ci, size }: { v: number; ci: number; size: number }) {
  const id = 'ar' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const r = 42;
  const circ = 2 * Math.PI * r;
  const g = RG[ci]!;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={g[0]} />
          <Stop offset="1" stopColor={g[1]} />
        </LinearGradient>
      </Defs>
      <Circle cx={50} cy={50} r={r} fill="none" stroke={C.grid} strokeWidth={6} />
      <Circle cx={50} cy={50} r={r} fill="none" stroke={`url(#${id})`} strokeWidth={6} strokeLinecap="round" strokeDasharray={`${v * circ} ${circ}`} transform="rotate(-90 50 50)" />
    </Svg>
  );
}

function GradLine({ text, fs }: { text: string; fs: number }) {
  const id = 'gl' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const w = fs * 0.56 * text.length;
  return (
    <Svg width={w} height={fs * 1.3} accessibilityLabel={text}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#35C7FF" />
          <Stop offset="1" stopColor="#6c8cff" />
        </LinearGradient>
      </Defs>
      <SvgText x={w / 2} y={fs} textAnchor="middle" fill={`url(#${id})`} fontSize={fs} fontWeight="800" fontFamily={F.display}>{text}</SvgText>
    </Svg>
  );
}

export function AuthShell({ children, deco, testID }: { children: ReactNode; deco?: boolean; testID?: string }) {
  const { u, tv } = useDevice();
  return (
    <Screen center scroll={!tv} maxWidth={100000} testID={testID}>
      <View style={tv ? { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: u * 3, paddingLeft: u * 0.25 } : { alignItems: 'center' }}>
        {children}
        {deco && tv ? (
          <View style={{ flex: 1, alignItems: 'center', gap: u * 1.25 }}>
            <View style={{ flexDirection: 'row', gap: u * 1.25 }}>
              {[0.92, 0.78, 0.64].map((x, i) => (
                <AuthRing key={i} v={x} ci={i} size={u * 7} />
              ))}
            </View>
            <View style={{ alignItems: 'center' }}>
              <X s={2.4} w="x" style={{ textAlign: 'center', letterSpacing: -u * 0.03 }}>React faster.</X>
              <GradLine text="Train smarter." fs={u * 2.4} />
            </View>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

export function ACard({ children }: { children: ReactNode }) {
  const { u, tv } = useDevice();
  return (
    <View style={{ width: '100%', maxWidth: u * 27, flexShrink: tv ? 0 : 1 }}>
      <Card pad={1.5}>{children}</Card>
    </View>
  );
}

export function Links({ items }: { items: [string, () => void][] }) {
  const { u } = useDevice();
  return (
    <View style={{ marginTop: u * 0.75, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: u * 0.75 }}>
      {items.map(([l, fn]) => (
        <LinkBtn key={l} label={l} onPress={fn} />
      ))}
    </View>
  );
}

function LinkBtn({ label, onPress }: { label: string; onPress: () => void }) {
  const { u } = useDevice();
  const { focused, handlers } = useFocus();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" {...handlers} style={{ paddingVertical: u * 0.375, borderRadius: u * 0.5, borderWidth: focused ? u * 0.15 : 0, borderColor: '#fff' }}>
      <X s={0.85} w="b" c="#a9b8ff">{label}</X>
    </Pressable>
  );
}

export { Txt, C };
