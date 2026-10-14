import { useState } from 'react';
import type { KeyboardTypeOptions } from 'react-native';
import { Pressable, TextInput, View } from 'react-native';
import type { ReactNode } from 'react';
import { C } from '../theme/tokens';
import { glassLo, neoIn } from '../theme/surfaces';
import { useDevice } from '../theme/device';
import { Icon } from './Icon';
import { Txt } from './Txt';
import { useFocus } from './useFocus';
import { TvKeyboard } from './TvKeyboard';
import type { KeyboardMode } from './TvKeyboard';
import { F } from '../theme/tokens';

interface Props {
  label: string;
  /** shows a red asterisk after the label */
  required?: boolean;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secure?: boolean;
  error?: string | null;
  hint?: string;
  keyboardType?: KeyboardType;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  /** which on-screen keyboard to use on TV */
  tvKeyboard?: KeyboardMode;
  /** fixed text shown before the value (for example NB-) */
  prefix?: string;
  onSubmit?: () => void;
  right?: ReactNode;
  multiline?: boolean;
  maxLength?: number;
  autoFocus?: boolean;
  preferredFocus?: boolean;
  testID?: string;
  returnKeyType?: 'done' | 'next' | 'go';
  autoComplete?: 'username' | 'password' | 'off' | 'new-password' | 'current-password';
}
type KeyboardType = KeyboardTypeOptions;

export function Field({
  label,
  required,
  value,
  onChangeText,
  placeholder,
  secure,
  error,
  hint,
  keyboardType,
  autoCapitalize = 'none',
  tvKeyboard = 'full',
  prefix,
  onSubmit,
  right,
  multiline,
  maxLength,
  autoFocus,
  preferredFocus,
  testID,
  returnKeyType,
  autoComplete,
}: Props) {
  const { tv, u } = useDevice();
  const { focused, handlers } = useFocus();
  const [reveal, setReveal] = useState(false);
  const [kb, setKb] = useState(false);
  const ring = error ? `0 0 0 ${u * 0.13}px rgba(255,122,138,.8)` : focused ? (tv ? `0 0 0 ${u * 0.18}px #fff` : `0 0 0 ${u * 0.13}px rgba(108,140,255,.7)`) : undefined;
  const box = {
    minHeight: u * 3.2,
    borderRadius: u,
    paddingHorizontal: u,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: u * 0.5,
    ...glassLo(),
    ...neoIn(u),
    ...(focused ? { backgroundColor: C.tintHi } : null),
    ...(ring ? { boxShadow: ring } : null),
  } as object;

  return (
    <View style={{ gap: u * 0.375, marginBottom: u * 0.75, minWidth: 0 }}>
      <Txt v="body" size={0.85 * 15} color={C.sub} style={{ fontFamily: F.body }}>
        {label}
        {required ? <Txt v="body" size={0.85 * 15} color={C.danger}>{' *'}</Txt> : null}
      </Txt>
      {tv ? (
        <>
          <Pressable
            testID={testID}
            onPress={() => setKb(true)}
            hasTVPreferredFocus={preferredFocus}
            accessibilityRole="button"
            accessibilityLabel={`${label}. ${value ? (secure ? 'entered' : value) : 'empty'}. Press to type.`}
            {...handlers}
            style={box}
          >
            <Txt v="body" size={1 * 15} color={value ? C.text : C.faint} style={{ flex: 1 }} numberOfLines={1}>
              {value ? (secure ? '•'.repeat(value.length) : (prefix ?? '') + value) : placeholder ?? ' '}
            </Txt>
            <Icon name="edit" size={u * 1.2} color={C.sub} />
          </Pressable>
          <TvKeyboard visible={kb} title={label} value={value} secure={secure} mode={tvKeyboard} prefix={prefix} onChange={onChangeText} onClose={() => setKb(false)} />
        </>
      ) : (
        <View style={[box, multiline && { alignItems: 'flex-start', paddingVertical: u * 0.5 }]}>
          {prefix ? <Txt v="mono" color={C.sub}>{prefix}</Txt> : null}
          <TextInput
            testID={testID}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={C.faint}
            secureTextEntry={secure && !reveal}
            keyboardType={keyboardType}
            autoCapitalize={autoCapitalize}
            autoCorrect={false}
            autoFocus={autoFocus}
            multiline={multiline}
            maxLength={maxLength}
            returnKeyType={returnKeyType}
            autoComplete={autoComplete}
            onSubmitEditing={onSubmit}
            accessibilityLabel={required ? `${label}, required` : label}
            aria-required={required}
            selectionColor={C.primary}
            cursorColor={C.primary}
            {...handlers}
            style={[
              {
                flex: 1,
                color: C.text,
                fontFamily: F.bodyMed,
                fontSize: u,
                paddingVertical: u * 0.625,
                minHeight: multiline ? u * 4.4 : u * 2.2,
                textAlignVertical: multiline ? 'top' : 'center',
              },
              // web: remove the browser outline, the border above is the focus indicator
              { outlineStyle: 'none' } as object,
            ]}
          />
          {secure ? (
            <Pressable onPress={() => setReveal((r) => !r)} accessibilityRole="button" accessibilityLabel={reveal ? 'Hide' : 'Show'} hitSlop={10} style={{ padding: 6 }}>
              <Icon name={reveal ? 'eyeOff' : 'eye'} size={22} color={C.sub} />
            </Pressable>
          ) : null}
          {right}
        </View>
      )}
      <View style={{ minHeight: u * 1.1 }}>
        {error ? <Txt v="body" size={0.8 * 15} color={C.danger}>{error}</Txt> : hint ? <Txt v="small" size={0.8 * 15}>{hint}</Txt> : null}
      </View>
    </View>
  );
}
