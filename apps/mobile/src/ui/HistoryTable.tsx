// A player's full history as a table, like the audit log: when they played, which game and level, accuracy, reaction time,
// hits, misses and how the round ended. Rows come from the stored rounds, so stopped rounds show as "Stopped".

import { ScrollView, View } from 'react-native';
import { GAMES } from '@nboard/shared';
import type { SessionDTO } from '@nboard/shared';
import { C } from '../theme/tokens';
import { glassLo } from '../theme/surfaces';
import { useDevice } from '../theme/device';
import { usePaged } from '../lib/queries';
import { Button } from './Button';
import { Card } from './Card';
import { CardH, Empty, X } from './Bits';
import { LoadingBlock } from './States';

const COLS: { k: string; w: number; right?: boolean }[] = [
  { k: 'When', w: 9.5 },
  { k: 'Game', w: 8 },
  { k: 'Level', w: 3.5, right: true },
  { k: 'Accuracy', w: 5, right: true },
  { k: 'Avg RT', w: 5, right: true },
  { k: 'Hits', w: 3.5, right: true },
  { k: 'Misses', w: 4, right: true },
  { k: 'Status', w: 8 },
];

const STATUS: Record<string, [string, 'ok' | 'warn' | 'bad']> = {
  completed: ['Completed', 'ok'],
  interrupted: ['Stopped', 'warn'],
  aborted: ['Aborted', 'bad'],
  started: ['Started', 'warn'],
};

function when(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' })} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}`;
}

export function HistoryTable({ playerId, games, accuracy }: { playerId: string; games: number; accuracy: number | null }) {
  const { u } = useDevice();
  const list = usePaged<SessionDTO>(`/players/${playerId}/results`, { limit: 40 });
  const rows = list.items;
  return (
    <Card>
      <CardH em={`${games} ${games === 1 ? 'game' : 'games'} · ${accuracy === null ? '--' : `${Math.round(accuracy * 10) / 10}%`} accuracy`}>History</CardH>
      {list.isLoading ? (
        <LoadingBlock label="Loading history" />
      ) : rows.length === 0 ? (
        <Empty>No rounds yet.</Empty>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={{ flexGrow: 1 }}>
          <View style={{ flexGrow: 1, minWidth: u * (COLS.reduce((n, c) => n + c.w, 0) + COLS.length * 0.5 + 1) }}>
            <View style={{ flexDirection: 'row', gap: u * 0.5, paddingHorizontal: u * 0.5, paddingBottom: u * 0.375 }}>
              {COLS.map((c) => <X key={c.k} s={0.72} w="b" up c={C.faint} style={{ flexGrow: c.w, flexShrink: 0, flexBasis: u * c.w, textAlign: c.right ? 'right' : 'left' }}>{c.k}</X>)}
            </View>
            {rows.map((r, i) => {
              const s = r.summary;
              const [label, tone] = STATUS[r.status] ?? [r.status, 'warn'];
              const cells = [
                when(r.started_at),
                GAMES[r.game]?.name ?? r.game,
                String(r.level),
                s ? `${+s.accuracy.toFixed(1)}%` : '--',
                s?.avg_rt != null ? `${Math.round(s.avg_rt)} ms` : '--',
                String(s?.correct_hits ?? 0),
                String(s?.misses ?? 0),
              ];
              return (
                <View key={r.id} style={[{ flexDirection: 'row', alignItems: 'center', gap: u * 0.5, paddingHorizontal: u * 0.5, paddingVertical: u * 0.5, borderRadius: u }, i % 2 ? glassLo() : null]}>
                  {cells.map((c, j) => <X key={j} s={0.82} w={j === 0 ? 'b' : 'm'} num style={{ flexGrow: COLS[j]!.w, flexShrink: 0, flexBasis: u * COLS[j]!.w, textAlign: COLS[j]!.right ? 'right' : 'left' }} numberOfLines={1}>{c}</X>)}
                  <X s={0.8} w="b" c={tone === 'ok' ? C.success : tone === 'warn' ? C.warning : C.danger} style={{ flexGrow: COLS[7]!.w, flexShrink: 0, flexBasis: u * COLS[7]!.w }} numberOfLines={1}>{label}</X>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
      {list.hasNextPage ? <View style={{ marginTop: u * 0.75 }}><Button size="sm" variant="secondary" label="Load more" loading={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()} /></View> : null}
    </Card>
  );
}