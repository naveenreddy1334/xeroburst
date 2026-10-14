// The animated rules (S07): a small board with lights and a finger tapping, 3 or 4 steps.

import { useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import type { HowToStep } from '@nboard/shared';
import { C, alpha, glow, onColor } from '../theme/tokens';
import { Icon } from '../ui/Icon';
import { useNative, useReducedMotion } from '../ui/motion';
import { Txt } from '../ui/Txt';

interface Props {
  steps: HowToStep[];
  accent: string;
  width?: number;
  step: number;
}

export function MiniBoard({ steps, accent, width = 300, step }: Props) {
  const s = steps[Math.min(step, steps.length - 1)]!;
  const cols = 5;
  const gap = 8;
  const size = (width - gap * (cols - 1)) / cols;
  const reduced = useReducedMotion();
  const tap = useRef(new Animated.Value(0)).current;
  const [tapKey, setTapKey] = useState(0);

  useEffect(() => {
    setTapKey((k) => k + 1);
    tap.setValue(0);
    if (s.tap === undefined || reduced) {
      tap.setValue(s.tap === undefined ? 0 : 1);
      return;
    }
    const a = Animated.loop(
      Animated.sequence([
        Animated.delay(250),
        Animated.timing(tap, { toValue: 1, duration: 260, useNativeDriver: useNative }),
        Animated.delay(350),
        Animated.timing(tap, { toValue: 0, duration: 220, useNativeDriver: useNative }),
        Animated.delay(250),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [step, s.tap, reduced, tap]);

  return (
    <View style={{ width, gap, alignItems: 'center' }} accessibilityLabel={s.caption}>
      {[0, 1].map((r) => (
        <View key={r} style={{ flexDirection: 'row', gap }}>
          {Array.from({ length: cols }, (_, c) => {
            const n = r * cols + c + 1;
            const on = s.lit.includes(n);
            const tapped = s.tap === n;
            return (
              <View key={`${tapKey}-${n}`} style={{ width: size, height: size }}>
                <View
                  style={{
                    flex: 1,
                    borderRadius: size * 0.28,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: on ? accent : C.surface2,
                    borderWidth: 2,
                    borderColor: on ? accent : C.borderStrong,
                    ...(on ? glow(accent, size * 0.4, 0.9) : {}),
                  }}
                >
                  <Txt v="num" size={size * 0.3} color={on ? onColor(accent) : C.faint}>
                    {n}
                  </Txt>
                </View>
                {tapped ? (
                  <Animated.View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      right: -4,
                      bottom: -10,
                      opacity: tap.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
                      transform: [{ translateY: tap.interpolate({ inputRange: [0, 1], outputRange: [14, -4] }) }, { scale: tap.interpolate({ inputRange: [0, 1], outputRange: [1.1, 0.9] }) }],
                    }}
                  >
                    <View style={{ width: size * 0.62, height: size * 0.62, borderRadius: 99, backgroundColor: alpha(C.text, 0.92), alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="user" size={size * 0.34} color={C.bg} />
                    </View>
                  </Animated.View>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}
