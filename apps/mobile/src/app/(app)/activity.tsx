// S24 Recent activity feed across players in scope.

import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { GAMES, fmtMetric } from '@nboard/shared';
import type { ActivityItem } from '@nboard/shared';
import { C } from '../../theme/tokens';
import { useDevice } from '../../theme/device';
import { useGet } from '../../lib/queries';
import { RequirePermission } from '../../ui/RequirePermission';
import { Screen } from '../../ui/Screen';
import { Header } from '../../ui/Header';
import { Card } from '../../ui/Card';
import { Badge } from '../../ui/Chip';
import { Icon } from '../../ui/Icon';
import { Txt } from '../../ui/Txt';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../ui/States';
import { gridStyle, timeAgo } from '../../staff/players-common';

function Row({ a, onOpen }: { a: ActivityItem; onOpen: () => void }) {
  const info = GAMES[a.game];
  return (
    <Card onPress={onOpen} accent={info.accent} accessibilityLabel={`${a.player_name}, ${info.name}, level ${a.level}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
      <Icon name={info.icon} size={26} color={info.accent} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="bodyStrong" numberOfLines={1}>
          {a.player_name}
        </Txt>
        <Txt v="small" numberOfLines={1}>
          {a.player_code} - {info.name} - level {a.level}
        </Txt>
        <Txt v="small">{timeAgo(a.ended_at)}</Txt>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {a.status === 'completed' ? (
          <Txt v="mono" color={C.text}>
            {fmtMetric(a.game, a.primary)}
          </Txt>
        ) : (
          <Badge label={a.status} color={a.status === 'aborted' ? C.danger : C.warning} />
        )}
        {a.is_pb ? <Badge label="PB" icon="trophy" color={C.highlight} /> : null}
      </View>
    </Card>
  );
}

function Feed() {
  const router = useRouter();
  const { cols } = useDevice();
  const q = useGet<{ items: ActivityItem[] }>('/activity', { limit: 50 });
  const items = q.data?.items ?? [];
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()} testID="screen-activity">
      <Header title="Activity" subtitle="Latest rounds" back />
      {q.isLoading ? (
        <LoadingBlock label="Loading activity" />
      ) : q.isError ? (
        <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyBlock icon="clock" title="No activity yet" message="Rounds played by players show up here." />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {items.map((a) => (
            <View key={a.id} style={[gridStyle(Math.min(cols, 2)), { flexDirection: 'row' }]}>
              <Row a={a} onOpen={() => router.push(`/results/${a.id}` as never)} />
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

export default function Activity() {
  return (
    <RequirePermission any={['VIEW_RESULTS']}>
      <Feed />
    </RequirePermission>
  );
}
