// On-screen keyboard for TV remotes (and a handy fallback anywhere). Every key is focusable and
// has a focus ring; the d-pad moves between them. A TV has no camera for the QR and no forms
// beyond this: Player ID digits, PIN, and the server address.

import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { C, R, alpha, glow } from '../theme/tokens';
import { Txt } from './Txt';
import { Icon } from './Icon';
import { useFocus } from './useFocus';

export type KeyboardMode = 'numeric' | 'address' | 'full';

interface Props {
  visible: boolean;
  title: string;
  value: string;
  secure?: boolean;
  mode: KeyboardMode;
  prefix?: string;
  onChange: (v: string) => void;
  onClose: () => void;
}

const ROWS_FULL = [
  '1234567890'.split(''),
  'qwertyuiop'.split(''),
  'asdfghjkl'.split(''),
  'zxcvbnm'.split(''),
  ['.', '-', '_', '@', ':', '/'],
];

function Key({ label, onPress, wide, icon, tone, preferred }: { label?: string; onPress: () => void; wide?: number; icon?: 'back' | 'check'; tone?: 'primary' | 'danger'; preferred?: boolean }) {
  const { focused, handlers } = useFocus();
  return (
    <Pressable
      onPress={onPress}
      hasTVPreferredFocus={preferred}
      accessibilityRole="button"
      accessibilityLabel={label ?? (icon === 'back' ? 'Delete' : 'Done')}
      {...handlers}
      style={{
        flex: wide ?? 1,
        minHeight: 64,
        borderRadius: R.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tone === 'primary' ? C.primary : tone === 'danger' ? alpha(C.danger, 0.15) : C.surface2,
        borderWidth: focused ? 3 : 1.5,
        borderColor: focused ? C.text : C.borderStrong,
        transform: [{ scale: focused ? 1.06 : 1 }],
        ...(focused ? glow(C.primary, 16, 0.8) : {}),
      }}
    >
      {icon ? <Icon name={icon} size={28} color={tone === 'primary' ? C.onPrimary : C.text} /> : <Txt v="num" size={26} color={tone === 'primary' ? C.onPrimary : C.text}>{label}</Txt>}
    </Pressable>
  );
}

export function TvKeyboard({ visible, title, value, secure, mode, prefix, onChange, onClose }: Props) {
  const [upper, setUpper] = useState(false);
  const add = (ch: string) => onChange(value + (upper ? ch.toUpperCase() : ch));
  const back = () => onChange(value.slice(0, -1));
  const shown = secure ? '•'.repeat(value.length) : (prefix ?? '') + value;

  const numeric = mode === 'numeric' || mode === 'address';
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <View style={{ flex: 1, backgroundColor: C.scrim, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ width: '100%', maxWidth: numeric ? 560 : 980, backgroundColor: C.surface, borderRadius: R.xl, borderWidth: 1.5, borderColor: C.borderStrong, padding: 24, gap: 12 }}>
          <Txt v="label">{title}</Txt>
          <View style={{ minHeight: 60, borderRadius: R.md, backgroundColor: C.bg, borderWidth: 1.5, borderColor: C.primary, justifyContent: 'center', paddingHorizontal: 16 }}>
            <Txt v="num" size={28} numberOfLines={1}>
              {shown || ' '}
            </Txt>
          </View>
          {numeric ? (
            <View style={{ gap: 8 }}>
              {[['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']].map((row) => (
                <View key={row.join('')} style={{ flexDirection: 'row', gap: 8 }}>
                  {row.map((k) => (
                    <Key key={k} label={k} onPress={() => onChange(value + k)} preferred={k === '5'} />
                  ))}
                </View>
              ))}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {mode === 'address' ? <Key label="." onPress={() => onChange(value + '.')} /> : <Key label="C" tone="danger" onPress={() => onChange('')} />}
                <Key label="0" onPress={() => onChange(value + '0')} />
                {mode === 'address' ? <Key label=":" onPress={() => onChange(value + ':')} /> : <Key icon="back" onPress={back} />}
              </View>
              {mode === 'address' ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Key label="C" tone="danger" onPress={() => onChange('')} />
                  <Key icon="back" onPress={back} />
                </View>
              ) : null}
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {ROWS_FULL.map((row, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 6 }}>
                  {row.map((k) => (
                    <Key key={k} label={upper ? k.toUpperCase() : k} onPress={() => add(k)} preferred={i === 1 && k === 't'} />
                  ))}
                </View>
              ))}
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Key label={upper ? 'abc' : 'ABC'} wide={2} onPress={() => setUpper((u) => !u)} />
                <Key label="space" wide={4} onPress={() => onChange(value + ' ')} />
                <Key icon="back" wide={2} onPress={back} />
                <Key label="C" wide={1} tone="danger" onPress={() => onChange('')} />
              </View>
            </View>
          )}
          <Key icon="check" tone="primary" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}
