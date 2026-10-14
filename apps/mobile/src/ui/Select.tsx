// The design's dropdown: a quiet field with a chevron at the right. Opens a list sheet (works with touch and D-pad).

import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { C } from '../theme/tokens';
import { glassLo, glassSurface, neoIn } from '../theme/surfaces';
import { useDevice } from '../theme/device';
import { Icon } from './Icon';
import { X } from './Bits';
import { useFocus } from './useFocus';
import { GradientFill } from './Gradient';

export interface Opt { value: string; label: string }

export function Select({ value, onChange, options, label, w, h, disabled }: { value: string; onChange: (v: string) => void; options: Opt[]; label: string; w?: number | string; h?: number; disabled?: boolean }) {
  const { u } = useDevice();
  const [open, setOpen] = useState(false);
  const { focused, handlers } = useFocus();
  const cur = options.find((o) => o.value === value);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${cur?.label ?? ''}`}
        accessibilityState={{ disabled: !!disabled, expanded: open }}
        onPress={disabled ? undefined : () => setOpen(true)}
        focusable={!disabled}
        {...handlers}
        style={[
          { minHeight: h ?? u * 3.2, borderRadius: u, paddingHorizontal: u * 0.75, flexDirection: 'row', alignItems: 'center', gap: u * 0.5, minWidth: 0, opacity: disabled ? 0.5 : 1, width: w as never },
          glassLo(),
          neoIn(u),
          focused ? { boxShadow: `0 0 0 ${u * 0.18}px #fff` } as never : null,
        ]}
      >
        <X s={1} w="m" style={{ flex: 1 }} numberOfLines={1}>{cur?.label ?? ''}</X>
        <Icon name="chevronDown" size={u * 1.1} color={C.sub} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(3,4,10,.6)', alignItems: 'center', justifyContent: 'center', padding: u * 1.25 }}>
          <Pressable onPress={() => {}} style={[{ width: '100%', maxWidth: u * 24, maxHeight: '70%', borderRadius: u * 1.6, padding: u * 0.75 }, glassSurface(u, true)]}>
            <X s={0.85} w="b" c={C.sub} style={{ marginBottom: u * 0.5, paddingHorizontal: u * 0.5 }}>{label}</X>
            <ScrollView contentContainerStyle={{ gap: u * 0.25 }}>
              {options.map((o) => {
                const on = o.value === value;
                return (
                  <Pressable key={o.value} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => { setOpen(false); onChange(o.value); }} style={{ borderRadius: u, overflow: 'hidden', paddingHorizontal: u * 0.75, paddingVertical: u * 0.625, flexDirection: 'row', alignItems: 'center' }}>
                    {on ? <GradientFill /> : null}
                    <X s={0.95} w={on ? 'b' : 'm'} c={on ? '#fff' : C.text} style={{ flex: 1 }}>{o.label}</X>
                    {on ? <Icon name="check" size={u} color="#fff" /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
