// S05 Modules. The reaction board is live; nBase, nCourt and nPad are visible and disabled ("Coming soon").

import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ModuleDTO } from '@nboard/shared';
import { Screen } from '../../ui/Screen';
import { Header } from '../../ui/Header';
import { Card } from '../../ui/Card';
import { Poster } from '../../ui/Poster';
import { useDevice } from '../../theme/device';
import type { IconName } from '@nboard/shared';
import { Badge } from '../../ui/Chip';
import { ErrorBlock, LoadingBlock } from '../../ui/States';
import { C } from '../../theme/tokens';
import { useGet } from '../../lib/queries';
import { RequirePermission } from '../../ui/RequirePermission';
import { setModule } from '../../lib/module';
import type { ModuleKey } from '@nboard/shared';

const BLURB: Record<string, string> = {
  nboard: 'Reaction, memory and focus games on the 10-button board.',
  nbase: 'Footwork and base training. Runs on the shared 10-button games.',
  ncourt: 'Court movement and agility. Runs on the shared 10-button games.',
  npad: 'Pad work and striking drills. Runs on the shared 10-button games.',
};

const MOD: Record<string, { sub: string; tag: string; colors: [string, string]; icon: IconName }> = {
  nboard: { tag: 'Reflex & focus', sub: 'Four games on the 10-button board: Quick Reaction, Memory Sequence, Target Hunt and Endurance.', colors: ['#7a2bff', '#2a0b6e'], icon: 'bolt' },
  nbase: { tag: 'Footwork & base', sub: 'Footwork and base training.', colors: ['#3fdcc4', '#0b4f78'], icon: 'flame' },
  ncourt: { tag: 'Agility & movement', sub: 'Court movement and agility.', colors: ['#12bfd0', '#0a3f8a'], icon: 'target' },
  npad: { tag: 'Striking & power', sub: 'Pad work and striking drills.', colors: ['#4a62ff', '#161c72'], icon: 'memory' },
};

function ModulesScreen() {
  const router = useRouter();
  const { u, tv } = useDevice();
  const q = useGet<{ items: ModuleDTO[] }>('/modules');
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()} testID="screen-modules">
      <Header eyebrow="Pick what to train" title="Modules" subtitle="nBoard is live. nBase, nCourt and nPad are empty for now." />
      {q.isLoading ? <LoadingBlock /> : q.error ? <ErrorBlock error={q.error} onRetry={() => void q.refetch()} /> : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: u * 0.875, marginTop: u * 0.5 }}>
          {q.data!.items.map((m) => {
            const live = m.key === 'nboard';
            const d = MOD[m.key] ?? MOD.nbase!;
            return (
              <View key={m.key} style={{ width: tv ? '23.5%' : '48.5%', flexGrow: 1 }}>
                <Poster
                  testID={`module-${m.key}`}
                  title={live ? 'nBoard' : m.name}
                  sub={d.sub}
                  tag={d.tag}
                  colors={d.colors}
                  icon={d.icon}
                  locked={live ? undefined : 'Empty for now'}
                  preferredFocus={live}
                  onPress={() => { if (live) { setModule(m.key as ModuleKey); router.push('/nboard' as never); } else router.push({ pathname: '/nboard/soon', params: { m: m.key } } as never); }}
                />
              </View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

export default function Modules() {
  return (
    <RequirePermission any={['PLAY_GAME']}>
      <ModulesScreen />
    </RequirePermission>
  );
}