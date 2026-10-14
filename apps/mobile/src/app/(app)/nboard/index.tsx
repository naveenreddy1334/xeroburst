// S06 Reaction Board games hub. Four games; locked ones show a lock and the word, never colour alone.

import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { GAMES, fmtMetric, GAME_SLUGS } from '@nboard/shared';
import type { GameDTO } from '@nboard/shared';
import { Screen } from '../../../ui/Screen';
import { Header } from '../../../ui/Header';
import { Poster, POSTER_COLORS } from '../../../ui/Poster';
import { useDevice } from '../../../theme/device';
import { Txt } from '../../../ui/Txt';
import { Icon } from '../../../ui/Icon';
import { Badge } from '../../../ui/Chip';
import { ProgressBar } from '../../../ui/Progress';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../ui/States';
import { C, GAME_ACCENT, alpha } from '../../../theme/tokens';
import { useGet } from '../../../lib/queries';
import { RequirePermission } from '../../../ui/RequirePermission';
import { useModule } from '../../../lib/module';

const SUB: Record<string, string> = { quick: 'Pure speed', memory: 'Watch, then repeat', hunt: 'Find the number', endure: 'Hold the pace' };

function Tile({ g, first }: { g: GameDTO; first: boolean }) {
  const router = useRouter();
  const info = GAMES[g.slug];
  const locked = g.state === 'locked';
  return (
    <Poster
      testID={`game-${g.slug}`}
      title={info.name}
      sub={SUB[g.slug] ?? info.tagline}
      colors={POSTER_COLORS[g.slug]!}
      icon={info.icon}
      locked={locked ? 'Locked by coach' : undefined}
      preferredFocus={first && !locked}
      onPress={() => router.push(`/nboard/${g.slug}/howto` as never)}
    />
  );
}

export default function GamesHub() {
  const { u, tv } = useDevice();
  const mod = useModule();
  const modName = { nboard: 'nBoard', nbase: 'nBase', ncourt: 'nCourt', npad: 'nPad' }[mod];
  const q = useGet<{ items: GameDTO[] }>('/games');
  const items = q.data ? GAME_SLUGS.map((s) => q.data!.items.find((g) => g.slug === s)).filter(Boolean) as GameDTO[] : [];
  const firstOpen = items.find((g) => g.state !== 'locked')?.slug;
  return (
    <RequirePermission any={['PLAY_GAME']}>
      <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()} testID="screen-games">
        <Header eyebrow="Modules / nBoard" title={modName} subtitle="Choose a game." back="/modules" backLabel="All modules" />
        {q.isLoading ? <LoadingBlock /> : q.error ? <ErrorBlock error={q.error} onRetry={() => void q.refetch()} /> : items.length === 0 ? <EmptyBlock icon="lock" title="No games yet" message="Your coach unlocks games for you." /> : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: u * 0.875, marginTop: u * 0.25 }}>
            {items.map((g) => <View key={g.slug} style={{ width: tv ? '24%' : '48.5%', flexGrow: 1 }}><Tile g={g} first={g.slug === firstOpen} /></View>)}
          </View>
        )}
      </Screen>
    </RequirePermission>
  );
}
