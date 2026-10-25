import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import type { IconName } from '@nboard/shared';
import { C, alpha, glow, onColor } from '../theme/tokens';
import { glowBox, neoSurface } from '../theme/surfaces';
import { useDevice } from '../theme/device';
import { Icon } from './Icon';
import { Txt } from './Txt';
import { GradientFill } from './Gradient';
import { useFocus } from './useFocus';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';

interface Props {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  full?: boolean;
  /** custom accent for variant "accent" */
  color?: string;
  preferredFocus?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

/** Buttons as drawn in the design: sm = 2.5u tall, md = 3u, both rounded 1u. Primary is the vertical violet gradient with a lit top edge. */
export function Button({ label, onPress, variant = 'primary', icon, iconRight, loading, disabled, size = 'md', full, color, preferredFocus, style, accessibilityLabel, testID }: Props) {
  const { u } = useDevice();
  const { focused, handlers } = useFocus();
  const off = disabled || loading;
  const accent = color ?? C.primary;
  const fg = variant === 'primary' ? '#000000' : variant === 'accent' ? onColor(accent) : variant === 'danger' ? '#FF5263' : C.text;
  const minH = Math.max(40, u * (size === 'sm' ? 2.5 : size === 'lg' ? 3.4 : 3));
  const filled = variant === 'primary' || variant === 'accent';
  return (
    <Pressable
      testID={testID}
      onPress={off ? undefined : onPress}
      hasTVPreferredFocus={preferredFocus}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      focusable={!off}
      {...handlers}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: minH,
          borderRadius: u,
          paddingHorizontal: u * (size === 'sm' ? 1 : 1.5),
          borderColor: focused ? '#FFFFFF' : 'transparent',
          borderWidth: focused ? u * 0.18 : 0,
          opacity: off ? 0.5 : 1,
          alignSelf: full ? 'stretch' : 'flex-start',
          transform: [{ scale: focused ? 1.05 : pressed ? 0.96 : 1 }],
        },
        variant === 'accent' ? { backgroundColor: accent, ...glow(accent, 12, 0.35) } : null,
        variant === 'primary' ? glowBox(u, 'btn') : null,
        variant === 'secondary' ? neoSurface(u) : null,
        variant === 'ghost' ? { backgroundColor: C.tintHi } : null,
        variant === 'danger' ? { backgroundColor: alpha('#FF5263', 0.1), borderColor: focused ? '#FFFFFF' : alpha('#EF5A77', 0.25), borderWidth: focused ? u * 0.18 : 1 } : null,
        style,
      ]}
    >
      {variant === 'primary' ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: u, overflow: 'hidden' }]}>
          <GradientFill />
        </View>
      ) : null}
      <View style={[styles.row, { gap: u * 0.5 }]}>
        {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={u * 1.2} color={fg} /> : null}
        <Txt v="bodyStrong" size={size === 'sm' ? 12.8 : 14.1} color={fg} style={{ letterSpacing: 0, fontFamily: 'Manrope_700Bold' }} numberOfLines={1}>
          {label}
        </Txt>
        {iconRight && !loading ? <Icon name={iconRight} size={u * 1.2} color={fg} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center' },
});
