// Settings | Audit log | System as the design's segmented control. Each tab is its own route.

import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useCan } from '../state/auth';
import { useDevice } from '../theme/device';
import { Seg } from './Bits';

type Key = 'settings' | 'audit' | 'system';

export function SubTabs({ active }: { active: Key }) {
  const router = useRouter();
  const can = useCan();
  const { u } = useDevice();
  const tabs: { id: Key; label: string; href: string }[] = [
    { id: 'settings', label: 'Settings', href: '/settings' },
    ...(can('VIEW_AUDIT') ? [{ id: 'audit' as Key, label: 'Audit log', href: '/audit' }] : []),
    ...(can('MANAGE_SYSTEM') ? [{ id: 'system' as Key, label: 'System', href: '/system' }] : []),
  ];
  if (tabs.length < 2) return null;
  return (
    <View style={{ marginBottom: u }}>
      <Seg<Key> items={tabs.map((t) => [t.id, t.label])} value={active} onChange={(k) => k !== active && router.navigate(tabs.find((t) => t.id === k)!.href as never)} />
    </View>
  );
}
