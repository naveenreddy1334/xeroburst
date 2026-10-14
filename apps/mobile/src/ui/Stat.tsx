import { View } from 'react-native';
import type { IconName } from '@nboard/shared';
import { C, R, neo } from '../theme/tokens';
import { Icon } from './Icon';
import { Txt } from './Txt';
import { useDevice } from '../theme/device';
import { useCountUp } from './motion';

/** Plain numbers (and percentages) count up to their value when they appear. Anything else is shown as is. */
function CountValue({ value, color, size }: { value: string; color: string; size: number }) {
  const m = /^(-?\d+(?:\.\d+)?)(%?)$/.exec(value.trim());
  const target = m ? Number(m[1]) : null;
  const decimals = m && m[1]!.includes('.') ? m[1]!.split('.')[1]!.length : 0;
  const shown = useCountUp(target, 700, decimals);
  return <Txt v="num" color={color} size={size}>{m ? `${shown}${m[2]}` : value}</Txt>;
}

/** One number with a label and an optional trend note. */
export function Stat({ label, value, unit, note, noteColor, color = C.text, icon, flex = 1 }: { label: string; value: string; unit?: string; note?: string; noteColor?: string; color?: string; icon?: IconName; flex?: number }) {
  const { ui } = useDevice();
  return (
    <View style={{ flexGrow: flex, flexBasis: 140 * Math.min(ui, 1.2), backgroundColor: C.surface, borderRadius: R.lg, ...neo('card'), padding: 16, gap: 4 }} accessible accessibilityLabel={`${label}: ${value} ${unit ?? ''}. ${note ?? ''}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon ? <Icon name={icon} size={16} color={C.sub} /> : null}
        <Txt v="label" size={12}>{label}</Txt>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <CountValue value={value} color={color} size={28 * Math.min(ui, 1.25)} />
        {unit ? <Txt v="small">{unit}</Txt> : null}
      </View>
      {note ? <Txt v="small" color={noteColor ?? C.sub}>{note}</Txt> : null}
    </View>
  );
}

/** A responsive wrap of Stats. */
export function StatRow({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
      <Txt v="h2">{children}</Txt>
      {right}
    </View>
  );
}


