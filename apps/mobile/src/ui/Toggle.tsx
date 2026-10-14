import { useEffect, useRef } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { GradientFill } from './Gradient';
import { Txt } from './Txt';
import { C } from '../theme/tokens';
import { useFocus } from './useFocus';
import { useDevice } from '../theme/device';

interface Props {
  value: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
  onLabel?: string;
  offLabel?: string;
  color?: string;
}

/** The design's switch: a gradient track when on, a recessed grey one when off, and a white knob that springs across. */
export function Toggle({ value, onChange, label, hint, disabled }: Props) {
  const { u } = useDevice();
  const x = useRef(new Animated.Value(value ? 1 : 0)).current;
  const { focused, handlers } = useFocus();
  useEffect(() => {
    Animated.spring(x, { toValue: value ? 1 : 0, stiffness: 500, damping: 30, mass: 1, useNativeDriver: false }).start();
  }, [value, x]);
  return (
    <Pressable
      onPress={disabled ? undefined : () => onChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      {...handlers}
      style={{ flexDirection: 'row', alignItems: 'center', gap: u, minHeight: u * 2.5, opacity: disabled ? 0.5 : 1, borderRadius: u, borderWidth: focused ? u * 0.18 : 0, borderColor: '#fff', paddingHorizontal: focused ? u * 0.4 : 0 }}
    >
      <View style={{ flex: 1 }}>
        {label ? <Txt v="bodyStrong" size={15}>{label}</Txt> : null}
        {hint ? <Txt v="small" size={0.88 * 15}>{hint}</Txt> : null}
      </View>
      <View style={[{ width: u * 3.4, height: u * 1.9, borderRadius: 999, overflow: 'hidden', justifyContent: 'center' }, value ? null : { backgroundColor: C.tintHi, boxShadow: 'inset 0 2px 4px rgba(0,0,0,.5)' } as object]}>
        {value ? <GradientFill /> : null}
        <Animated.View
          style={{
            position: 'absolute',
            top: u * 0.25,
            left: u * 0.25,
            width: u * 1.4,
            height: u * 1.4,
            borderRadius: 999,
            backgroundColor: '#FFFFFF',
            boxShadow: '0 2px 6px rgba(0,0,0,.5)',
            transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, u * 1.5] }) }],
          } as never}
        />
      </View>
    </Pressable>
  );
}
