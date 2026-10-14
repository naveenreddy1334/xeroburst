// Audit log, as in the design: filters (Actor, Action) above a timeline of who did what. Read-only.
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { AuditEntryDTO } from '@nboard/shared';
import { Screen } from '../../ui/Screen';
import { Header } from '../../ui/Header';
import { SubTabs } from '../../ui/SubTabs';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Select } from '../../ui/Select';
import { Empty, X } from '../../ui/Bits';
import { RequirePermission } from '../../ui/RequirePermission';
import { ErrorBlock, LoadingBlock } from '../../ui/States';
import { C } from '../../theme/tokens';
import { useDevice } from '../../theme/device';
import { usePaged } from '../../lib/queries';
import { humanise } from '../../staff/staff-common';

const ACTIONS = ['LOGIN', 'LOGIN_FAILED', 'USER_CREATED', 'USER_UPDATED', 'USER_DEACTIVATED', 'CREDENTIALS_RESET', 'SETTINGS_CHANGED', 'BACKUP_CREATED', 'PLAYER_CREATED', 'PLAYER_UPDATED', 'PLAYER_DEACTIVATED', 'ACCESS_CHANGED', 'STAGE_ADVANCED'];
type Range = 'today' | '7d' | 'all';

export default function Audit() {
  return (
    <RequirePermission any={['VIEW_AUDIT']}>
      <AuditScreen />
    </RequirePermission>
  );
}

const lbl = (t: string, u: number) => <X s={0.78} w="b" c={C.sub}>{t}</X>;

function AuditScreen() {
  const { u, tv } = useDevice();
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [range, setRange] = useState<Range>('all');
  const from = useMemo(() => {
    if (range === 'all') return undefined;
    const d = new Date();
    if (range === 'today') d.setHours(0, 0, 0, 0);
    else d.setDate(d.getDate() - 7);
    return d.toISOString();
  }, [range]);

  const everyone = usePaged<AuditEntryDTO>('/audit', { limit: 100 });
  const actors = useMemo(() => [...new Set(everyone.items.map((e) => e.actor_name).filter((x): x is string => !!x))].sort(), [everyone.items]);
  const acts = useMemo(() => [...new Set([...ACTIONS, ...everyone.items.map((e) => e.action)])], [everyone.items]);
  const list = usePaged<AuditEntryDTO>('/audit', { limit: 50, actor: actor || undefined, action: action || undefined, from });

  return (
    <Screen refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()} testID="screen-audit" maxWidth={100000}>
      <SubTabs active="audit" />
      <Header eyebrow="Read-only record of who did what" title="Audit log" />
      <View style={{ height: u * 0.75 }} />
      <Card>
        <View style={{ flexDirection: tv ? 'row' : 'column', gap: u * 0.625, marginBottom: u }}>
          <View style={{ flex: 1, gap: u * 0.375 }}>{lbl('Actor', u)}<Select label="Actor" value={actor} onChange={setActor} options={[{ value: '', label: 'All actors' }, ...actors.map((a) => ({ value: a, label: a }))]} /></View>
          <View style={{ flex: 1, gap: u * 0.375 }}>{lbl('Action', u)}<Select label="Action" value={action} onChange={setAction} options={[{ value: '', label: 'All actions' }, ...acts.map((a) => ({ value: a, label: humanise(a) }))]} /></View>
          <View style={{ flex: 1, gap: u * 0.375 }}>{lbl('Period', u)}<Select label="Period" value={range} onChange={(v) => setRange(v as Range)} options={[{ value: 'all', label: 'All time' }, { value: '7d', label: 'Last 7 days' }, { value: 'today', label: 'Today' }]} /></View>
        </View>
        {list.isLoading ? (
          <LoadingBlock label="Loading the log" />
        ) : list.isError ? (
          <ErrorBlock error={list.error} onRetry={() => void list.refetch()} />
        ) : list.items.length === 0 ? (
          <Empty>No entries match these filters.</Empty>
        ) : (
          <View style={{ gap: u * 0.75 }}>
            {list.items.map((e) => <Entry key={e.id} e={e} />)}
          </View>
        )}
        {list.hasNextPage ? <View style={{ marginTop: u * 0.75 }}><Button size="sm" label="Load more" variant="secondary" loading={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()} /></View> : null}
      </Card>
    </Screen>
  );
}

function Entry({ e }: { e: AuditEntryDTO }) {
  const { u } = useDevice();
  const [open, setOpen] = useState(false);
  const d = new Date(e.ts);
  const target = e.target_type ? `${humanise(e.target_type)}${e.target_id ? ` ${e.target_id}` : ''}` : '';
  const hasDetail = !!e.detail && Object.keys(e.detail).length > 0;
  const failed = e.action.includes('FAILED') || e.action.includes('DENIED');
  const hhmm = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  const day = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return (
    <View style={{ flexDirection: 'row', gap: u * 0.75 }}>
      <View style={{ width: u * 3.5 }}>
        <X s={0.88} w="s" c={C.faint} style={{ paddingTop: u * 0.125 }}>{hhmm}</X>
        <X s={0.7} c={C.faint}>{day}</X>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <X s={0.88}><X s={0.88} w="b">{e.actor_name ?? 'System'}</X> · <X s={0.88} c={failed ? C.danger : C.text}>{humanise(e.action)}</X></X>
        {target ? <X s={0.88} c={C.sub}>{target}</X> : null}
        {hasDetail ? (
          <Pressable accessibilityRole="button" onPress={() => setOpen(!open)} style={{ alignSelf: 'flex-start', marginTop: u * 0.125 }}>
            <X s={0.78} w="s" c={C.cyan}>{open ? 'Hide details' : 'Details'}</X>
          </Pressable>
        ) : null}
        {open ? <X s={0.75} c={C.sub} style={{ marginTop: u * 0.25 }}>{JSON.stringify(e.detail, null, 2)}</X> : null}
      </View>
    </View>
  );
}
