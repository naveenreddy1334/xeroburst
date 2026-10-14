// The gameplay "stage": a dark panel that shows what to do right now, large enough to read at arm's length.
//  - the target number pops in with a short red glow when it appears
//  - a correct press flashes the ring green, a wrong press or a missed target flashes it red and nudges it
// The motion is short (under 250 ms) and never moves the number around, so it cannot slow a reaction.

import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import { C, R, alpha, glow } from '../theme/tokens';
import { Txt } from '../ui/Txt';
import { Icon } from '../ui/Icon';
import { useNative, useReducedMotion } from '../ui/motion';
import type { PlayView } from '../lib/play';

interface Props {
  v: PlayView;
  accent: string;
  /** diameter of the number ring */
  ring: number;
  tv?: boolean;
}

type Mode = 'target' | 'watch' | 'repeat' | 'nohit' | 'wait';

function modeOf(v: PlayView): Mode {
  if (v.hint === 'nohit') return 'nohit';
  if (v.game === 'memory') return v.hint === 'repeat' ? 'repeat' : v.hint === 'watch' ? 'watch' : 'wait';
  return v.target ? 'target' : 'wait';
}

export function TargetStage({ v, accent, ring, tv }: Props) {
  const reduced = useReducedMotion();
  const pop = useRef(new Animated.Value(1)).current;
  const nudge = useRef(new Animated.Value(0)).current;
  const mode = modeOf(v);
  const bad = !!v.flash && !v.flash.ok;
  const good = !!v.flash && v.flash.ok;

  // Pop when a new target appears.
  const key = `${v.target ?? '-'}:${v.lit.join(',')}:${mode}`;
  useEffect(() => {
    if (reduced || mode !== 'target') {
      pop.setValue(1);
      return;
    }
    pop.setValue(0.78);
    Animated.timing(pop, { toValue: 1, duration: 170, easing: Easing.out(Easing.back(1.6)), useNativeDriver: useNative }).start();
  }, [key, mode, reduced, pop]);

  // Nudge sideways on a wrong press or a miss.
  useEffect(() => {
    if (!bad || reduced) return;
    nudge.setValue(0);
    Animated.sequence([
      Animated.timing(nudge, { toValue: 1, duration: 55, useNativeDriver: useNative }),
      Animated.timing(nudge, { toValue: -1, duration: 90, useNativeDriver: useNative }),
      Animated.timing(nudge, { toValue: 0, duration: 55, useNativeDriver: useNative }),
    ]).start();
  }, [bad, v.flash, reduced, nudge]);

  const color = bad ? C.danger : good ? C.success : mode === 'nohit' ? C.warning : accent;
  const label =
    mode === 'target' ? (v.game === 'hunt' ? 'Find button' : v.game === 'endure' ? 'Keep going' : 'Hit it') :
    mode === 'watch' ? 'Watch' :
    mode === 'repeat' ? 'Your turn' :
    mode === 'nohit' ? 'No hit' : 'Get ready';
  const big = mode === 'target' ? String(v.target) : mode === 'nohit' ? '✕' : mode === 'repeat' ? String(Math.min(v.step + 1, v.seqLen ?? 1)) : mode === 'watch' ? '●' : '·';
  const sub =
    mode === 'target' ? (v.game === 'hunt' ? 'Press the button with this number' : 'Press the lit button') :
    mode === 'watch' ? (v.seqLen ? `Sequence of ${v.seqLen}` : 'Remember the order') :
    mode === 'repeat' ? `Step ${Math.min(v.step + 1, v.seqLen ?? 1)} of ${v.seqLen ?? '?'}` :
    mode === 'nohit' ? 'Do not press anything' : 'Next light is coming';

  return (
    <View
      accessibilityLiveRegion="assertive"
      style={{
        alignSelf: 'stretch',
        alignItems: 'center',
        gap: 10,
        paddingVertical: tv ? 26 : 18,
        paddingHorizontal: 16,
        borderRadius: R.xl,
        backgroundColor: C.surface,
        borderWidth: 1.5,
        borderColor: alpha(color, 0.45),
        overflow: 'hidden',
        ...glow(color, 26, bad || good ? 0.5 : 0.22),
      }}
    >
      <Txt v="label" color={color} size={tv ? 18 : 14} style={{ letterSpacing: 3 }} testID="hint">{label}</Txt>
      <Animated.View
        style={{
          width: ring,
          height: ring,
          borderRadius: ring / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: alpha(color, bad || good ? 0.2 : 0.1),
          borderWidth: Math.max(4, ring * 0.035),
          borderColor: color,
          transform: [
            { scale: pop },
            { translateX: nudge.interpolate({ inputRange: [-1, 0, 1], outputRange: [-10, 0, 10] }) },
          ],
        }}
      >
        {mode === 'nohit' ? (
          <Icon name="close" size={ring * 0.46} color={color} strokeWidth={2.6} />
        ) : (
          <Txt v="display" size={ring * 0.56} color={mode === 'target' ? C.text : color} style={{ lineHeight: ring * 0.6 }} testID={v.game === 'hunt' && mode === 'target' ? 'hunt-target' : 'target-number'}>
            {big}
          </Txt>
        )}
      </Animated.View>
      <Txt v="small" size={tv ? 17 : 13} color={C.sub}>{sub}</Txt>
      {v.game === 'memory' && v.seqLen ? (
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
          {Array.from({ length: Math.min(v.seqLen, 15) }, (_, i) => (
            <View key={i} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: mode === 'repeat' && i < v.step ? C.success : alpha(accent, 0.28) }} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
