// The board on screen: 10 buttons, 5 columns by 2 rows. Lit buttons glow. In Demo Mode the buttons
// are tappable, so a whole round can be played on the phone with no hardware.

import { Animated, Pressable, View } from 'react-native';
import { C, R, alpha, glow, onColor } from '../theme/tokens';
import { Txt } from '../ui/Txt';
import { useFocus } from '../ui/useFocus';
import { usePulse } from '../ui/motion';

interface Props {
  lit: number[];
  /** the button to press now (ringed), for Target Hunt it is one of several lit LEDs */
  target?: number | null;
  /** decoys: lit but must not be pressed */
  decoys?: number[];
  /** last pressed button and whether it was right (brief flash) */
  flash?: { n: number; ok: boolean } | null;
  accent?: string;
  interactive?: boolean;
  onPress?: (n: number) => void;
  /** show button numbers */
  numbers?: boolean;
  width?: number;
  dim?: boolean;
}

export function BoardMirror({ lit, target, decoys = [], flash, accent = C.primary, interactive, onPress, numbers = true, width = 340, dim }: Props) {
  const cols = 5;
  const gap = Math.max(8, width * 0.03);
  const size = (width - gap * (cols - 1)) / cols;
  const rows = [0, 1];
  return (
    <View
      accessibilityLabel={`Board mirror. Lit buttons: ${lit.length ? lit.join(', ') : 'none'}`}
      style={{ width, gap, opacity: dim ? 0.5 : 1, padding: 0 }}
    >
      {rows.map((r) => (
        <View key={r} style={{ flexDirection: 'row', gap }}>
          {Array.from({ length: cols }, (_, c) => {
            const n = r * cols + c + 1;
            return (
              <Pad
                key={n}
                n={n}
                size={size}
                on={lit.includes(n)}
                isTarget={target === n}
                isDecoy={decoys.includes(n)}
                flash={flash?.n === n ? flash : null}
                accent={accent}
                interactive={!!interactive}
                numbers={numbers}
                onPress={onPress}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

function Pad({ n, size, on, isTarget, isDecoy, flash, accent, interactive, numbers, onPress }: {
  n: number; size: number; on: boolean; isTarget: boolean; isDecoy: boolean; flash: { ok: boolean } | null; accent: string; interactive: boolean; numbers: boolean; onPress?: (n: number) => void;
}) {
  const { focused, handlers } = useFocus();
  const pulse = usePulse(on, 900);
  const flashColor = flash ? (flash.ok ? C.success : C.danger) : null;
  const bg = flashColor ? alpha(flashColor, 0.35) : on ? accent : C.surface2;
  const border = flashColor ?? (on ? accent : isTarget ? accent : C.borderStrong);
  return (
    <Pressable
      disabled={!interactive}
      onPressIn={() => onPress?.(n)}
      accessibilityRole={interactive ? 'button' : 'image'}
      accessibilityLabel={`Button ${n}${on ? ', lit' : ''}`}
      {...handlers}
      style={{ width: size, height: size }}
    >
      <Animated.View
        style={{
          flex: 1,
          borderRadius: size * 0.28,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bg,
          borderWidth: focused ? 3 : 2,
          borderColor: focused ? C.text : border,
          ...(on ? glow(accent, size * 0.45, 0.95) : {}),
          opacity: on ? pulse.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) : 1,
        }}
      >
        {numbers ? (
          <Txt v="num" size={Math.max(14, size * 0.3)} color={on ? onColor(accent) : isDecoy ? C.sub : C.faint}>
            {n}
          </Txt>
        ) : null}
        {isTarget && !on ? <View style={{ position: 'absolute', inset: 4, borderRadius: size * 0.22, borderWidth: 2, borderColor: accent, borderStyle: 'dashed' }} /> : null}
      </Animated.View>
    </Pressable>
  );
}

export const BOARD_RADIUS = R.lg;
