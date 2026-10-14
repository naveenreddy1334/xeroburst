import { Pressable, View } from 'react-native';
import type { IconName } from '@nboard/shared';
import { C, R, alpha, glass, neo, onColor } from '../theme/tokens';
import { GradientFill } from './Gradient';
import { Icon } from './Icon';
import { Txt } from './Txt';
import { useFocus } from './useFocus';

/** A small status label. Locked is always an icon plus the word. */
export function Badge({ label, color = C.sub, icon, filled }: { label: string; color?: string; icon?: IconName; filled?: boolean }) {
  return (
    <View
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: R.pill,
        backgroundColor: filled ? color : alpha(color, 0.14),
        borderWidth: 1,
        borderColor: alpha(color, filled ? 1 : 0.5),
      }}
    >
      {icon ? <Icon name={icon} size={13} color={filled ? onColor(color) : color} strokeWidth={2.2} /> : null}
      <Txt v="label" size={12} color={filled ? onColor(color) : color} style={{ letterSpacing: 1 }}>
        {label}
      </Txt>
    </View>
  );
}

/** A selectable pill (filters, tabs). */
export function Chip({ label, selected, onPress, icon, color = C.highlight }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName; color?: string }) {
  const { focused, handlers } = useFocus();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      {...handlers}
      style={{
        minHeight: 44,
        paddingHorizontal: 16,
        borderRadius: R.pill,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: selected ? 'transparent' : C.surface,
        overflow: 'hidden',
        borderWidth: focused ? 2.5 : 0,
        borderColor: focused ? C.text : 'transparent',
        ...(selected ? {} : neo('chip')),
      }}
    >
      {selected ? <GradientFill /> : null}
      {icon ? <Icon name={icon} size={16} color={selected ? C.onPrimary : C.sub} /> : null}
      <Txt v="bodyStrong" size={14} color={selected ? C.onPrimary : C.sub}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** Day / Week / Month style switch. */
export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', backgroundColor: C.surface, ...glass(16), ...neo('chip'), borderRadius: R.md, padding: 4, gap: 4 }}
    >
      {options.map((o) => (
        <SegItem key={o.value} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />
      ))}
    </View>
  );
}

function SegItem({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { focused, handlers } = useFocus();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      {...handlers}
      style={{
        flex: 1,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: R.sm,
        backgroundColor: 'transparent',
        overflow: 'hidden',
        borderWidth: focused ? 2.5 : 0,
        borderColor: C.text,
      }}
    >
      {selected ? <GradientFill /> : null}
      <Txt v="bodyStrong" size={14} color={selected ? C.onPrimary : C.sub}>
        {label}
      </Txt>
    </Pressable>
  );
}
