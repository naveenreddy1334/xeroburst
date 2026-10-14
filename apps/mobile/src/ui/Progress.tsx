import { View } from 'react-native';
import { C, alpha, onColor } from '../theme/tokens';
import { useDrawIn } from './motion';
import { Txt } from './Txt';

export function ProgressBar({ value, color = C.highlight, height = 8, label }: { value: number; color?: string; height?: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const shown = pct * useDrawIn(800, pct);
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }} style={{ height, borderRadius: height, backgroundColor: alpha(color, 0.16), overflow: 'hidden' }}>
      <View style={{ width: `${shown}%`, height: '100%', borderRadius: height, backgroundColor: color }} />
    </View>
  );
}

/** Stage track: Week 1 done, Week 2 current, Week 3 locked ... */
export function StageTrack({ stages, current }: { stages: { label: string }[]; current: number }) {
  return (
    <View style={{ gap: 8 }}>
      {stages.map((s, i) => {
        const n = i + 1;
        const state = n < current ? 'done' : n === current ? 'current' : 'next';
        const color = state === 'done' ? C.success : state === 'current' ? C.primary : C.lockedText;
        return (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: color, backgroundColor: state === 'done' ? color : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              <Txt v="mono" size={11} color={state === 'done' ? onColor(color) : color}>
                {n}
              </Txt>
            </View>
            <Txt v="bodyStrong" color={state === 'next' ? C.lockedText : C.text} style={{ flex: 1 }}>
              {s.label}
            </Txt>
            <Txt v="label" color={color}>
              {state === 'done' ? 'Done' : state === 'current' ? 'Now' : 'Next'}
            </Txt>
          </View>
        );
      })}
    </View>
  );
}
