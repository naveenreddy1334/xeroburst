import { useEffect } from 'react';
import { View } from 'react-native';
import { create } from 'zustand';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, R, alpha, glow } from '../theme/tokens';
import { Icon } from './Icon';
import { Txt } from './Txt';

interface ToastState {
  msg: string | null;
  kind: 'info' | 'success' | 'error';
  id: number;
  show: (msg: string, kind?: 'info' | 'success' | 'error') => void;
  hide: () => void;
}

export const useToast = create<ToastState>((set) => ({
  msg: null,
  kind: 'info',
  id: 0,
  show: (msg, kind = 'info') => set((s) => ({ msg, kind, id: s.id + 1 })),
  hide: () => set({ msg: null }),
}));

export const toast = (msg: string, kind: 'info' | 'success' | 'error' = 'info') => useToast.getState().show(msg, kind);

export function ToastHost() {
  const { msg, kind, id, hide } = useToast();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(hide, kind === 'error' ? 5000 : 3000);
    return () => clearTimeout(t);
  }, [id, msg, kind, hide]);
  if (!msg) return null;
  const color = kind === 'error' ? C.danger : kind === 'success' ? C.success : C.primary;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 92, alignItems: 'center', zIndex: 50 }}>
      <View
        accessibilityLiveRegion="polite"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 560, backgroundColor: C.surface3, borderRadius: R.md, borderWidth: 1.5, borderColor: alpha(color, 0.7), paddingHorizontal: 16, paddingVertical: 12, ...glow(color, 14, 0.35) }}
      >
        <Icon name={kind === 'error' ? 'alert' : kind === 'success' ? 'check' : 'bolt'} size={20} color={color} />
        <Txt v="bodyStrong" style={{ flexShrink: 1 }}>
          {msg}
        </Txt>
      </View>
    </View>
  );
}
