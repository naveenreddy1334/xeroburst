import { Pressable, View } from 'react-native';
import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { C } from '../theme/tokens';
import { neoSurface } from '../theme/surfaces';
import { useDevice } from '../theme/device';
import { Txt } from './Txt';
import { useFocus } from './useFocus';

interface Props {
  title: string;
  subtitle?: string;
  back?: boolean | string;
  /** text of the back button on wide screens, for example "All modules" */
  backLabel?: string;
  right?: ReactNode;
  eyebrow?: string;
}

/** Page head from the design: a cyan eyebrow, the title (1.9u, 2.4u on TV), a grey line under it, actions at the right. */
export function Header({ title, subtitle, back, backLabel, right, eyebrow }: Props) {
  const router = useRouter();
  const { u, wide, tv } = useDevice();
  const { focused, handlers } = useFocus();
  const goBack = () => {
    if (typeof back === 'string') router.navigate(back as never);
    else if (router.canGoBack()) router.back();
    else router.navigate('/' as never);
  };
  const backBtn = back ? (
    <Pressable
      onPress={goBack}
      accessibilityRole="button"
      accessibilityLabel="Back"
      {...handlers}
      style={[
        wide
          ? { alignSelf: 'flex-start', minHeight: u * 2.5, paddingHorizontal: u, borderRadius: u, justifyContent: 'center' }
          : { width: u * 2.5, height: u * 2.5, borderRadius: u * 1.25, alignItems: 'center', justifyContent: 'center' },
        neoSurface(u),
        { borderWidth: focused ? u * 0.18 : 0, borderColor: '#FFFFFF' },
      ]}
    >
      <Txt v="bodyStrong" size={wide ? 12.8 : 19}>{wide ? `‹ ${backLabel ?? 'Back'}` : '‹'}</Txt>
    </Pressable>
  ) : null;
  return (
    <View style={{ gap: u * 0.75, marginBottom: u * 0.5, paddingTop: u * 0.75 }}>
      {!wide ? backBtn : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: u }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {eyebrow ? <Txt v="small" size={12.75} color="rgba(53,199,255,0.9)" style={{ fontFamily: 'Manrope_500Medium' }}>{eyebrow}</Txt> : null}
          <Txt v="h1" size={tv ? 36 : 28.5} numberOfLines={2} accessibilityRole="header" style={{ fontFamily: 'Manrope_600SemiBold', letterSpacing: -0.4, marginTop: u * 0.125, lineHeight: u * (tv ? 2.5 : 2) }}>
            {title}
          </Txt>
          {subtitle ? <Txt v="small" size={13.8} color={C.sub} style={{ marginTop: u * 0.25 }}>{subtitle}</Txt> : null}
        </View>
        {right ? <View style={{ marginTop: u * 0.75, alignSelf: 'flex-start' }}>{right}</View> : null}
      </View>
      {wide ? backBtn : null}
    </View>
  );
}
