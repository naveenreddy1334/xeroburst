// The Super Admin's payment log: every payment made in XeroBurst, newest first. A payment a player makes (or a coach records) shows
// here the moment it is saved, because the revenue figures are built from the same rows.

import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { PaymentLogDTO, PaymentLogItem, PaymentMethod } from '@nboard/shared';
import { C } from '../theme/tokens';
import { useDevice } from '../theme/device';
import { useGet } from '../lib/queries';
import { fmtFull, rupees } from '../lib/format';
import { Card } from './Card';
import { Button } from './Button';
import { Field } from './Field';
import { CardH, Empty, Pill, RoundChip, X } from './Bits';
import { ErrorBlock, LoadingBlock } from './States';

const PAGE = 15;
const METHODS: [PaymentMethod | null, string][] = [[null, 'All'], ['upi', 'UPI'], ['card', 'Card'], ['netbanking', 'Net banking'], ['cash', 'Cash']];
const METHOD_LABEL: Record<PaymentMethod, string> = { upi: 'UPI', card: 'Card', netbanking: 'Net banking', cash: 'Cash' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const month = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym} ${ym.slice(0, 4)}`;

function Line({ p, first, wide }: { p: PaymentLogItem; first: boolean; wide: boolean }) {
  const { u } = useDevice();
  const where = [p.hub_name, p.branch_name].filter(Boolean).join(' · ');
  const status = <Pill t={p.status === 'paid' ? 'good' : 'warn'}>{p.status === 'paid' ? 'Paid' : p.status}</Pill>;
  const by = p.recorded_by_self ? 'Paid online' : p.recorded_by_name ? `Recorded by ${p.recorded_by_name}` : '';
  if (wide) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.75, paddingVertical: u * 0.6, borderTopWidth: first ? 0 : 1, borderTopColor: C.border }}>
        <View style={{ flex: 1.3, minWidth: 0 }}>
          <X s={0.85} num numberOfLines={1}>{fmtFull(p.paid_at ?? p.created_at)}</X>
          <X s={0.72} c={C.faint} numberOfLines={1}>{p.reference ?? ''}</X>
        </View>
        <View style={{ flex: 1.6, minWidth: 0 }}>
          <X s={0.9} w="b" numberOfLines={1}>{p.player_name}</X>
          <X s={0.72} c={C.faint} numberOfLines={1}>{p.player_login}</X>
        </View>
        <X s={0.82} c={C.sub} style={{ flex: 1.6, minWidth: 0 }} numberOfLines={2}>{where || '--'}</X>
        <X s={0.85} style={{ flex: 0.9 }} numberOfLines={1}>{month(p.period)}</X>
        <View style={{ flex: 1.3, minWidth: 0 }}>
          <X s={0.85} numberOfLines={1}>{METHOD_LABEL[p.method]}</X>
          <X s={0.72} c={C.faint} numberOfLines={2}>{by}</X>
        </View>
        <X s={0.95} w="b" num style={{ flex: 0.9, textAlign: 'right' }}>{rupees(p.amount)}</X>
        <View style={{ flex: 0.7, alignItems: 'flex-end' }}>{status}</View>
      </View>
    );
  }
  return (
    <View style={{ gap: u * 0.2, paddingVertical: u * 0.7, borderTopWidth: first ? 0 : 1, borderTopColor: C.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.5 }}>
        <X s={0.95} w="b" style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>{p.player_name}</X>
        <X s={0.95} w="b" num>{rupees(p.amount)}</X>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.5 }}>
        <X s={0.78} c={C.sub} style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>{where || p.player_login}</X>
        {status}
      </View>
      <X s={0.74} c={C.faint} numberOfLines={2}>{month(p.period)} · {METHOD_LABEL[p.method]} · {fmtFull(p.paid_at ?? p.created_at)}{p.reference ? ` · ${p.reference}` : ''}{by ? ` · ${by}` : ''}</X>
    </View>
  );
}

export function PaymentLog({ hubs }: { hubs: { id: string; name: string }[] }) {
  const { u, wide } = useDevice();
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [hub, setHub] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [page, setPage] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => { setName(text.trim()); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [text]);
  const query: Record<string, string | number> = { limit: PAGE, offset: page * PAGE };
  if (method) query.method = method;
  if (hub) query.hub_id = hub;
  if (name) query.q = name;
  const q = useGet<PaymentLogDTO>('/finance/payments', query, { refetchInterval: 20000 });
  const d = q.data;
  const from = d && d.total ? page * PAGE + 1 : 0;
  const to = d ? Math.min(d.total, page * PAGE + d.items.length) : 0;
  const pick = <T,>(set: (v: T) => void, v: T) => { set(v); setPage(0); };

  return (
    <Card>
      <CardH em={d ? `${d.total} ${d.total === 1 ? 'payment' : 'payments'} · ${rupees(d.total_amount)} paid` : undefined}>Payment log</CardH>
      <View style={{ gap: u * 0.6, marginBottom: u * 0.75 }}>
        <Field inline label="Search a player" value={text} onChangeText={setText} autoCapitalize="none" maxLength={60} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: u * 0.5 }}>
          {METHODS.map(([k, l]) => <RoundChip key={l} label={l} on={method === k} onPress={() => pick(setMethod, k)} />)}
        </View>
        {hubs.length > 1 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: u * 0.5 }}>
            <RoundChip label="All hubs" on={hub === null} onPress={() => pick(setHub, null)} />
            {hubs.map((h) => <RoundChip key={h.id} label={h.name} on={hub === h.id} onPress={() => pick(setHub, h.id)} />)}
          </View>
        ) : null}
      </View>
      {q.isLoading ? <LoadingBlock label="Loading payments" /> : q.isError || !d ? <ErrorBlock error={q.error} onRetry={() => void q.refetch()} /> : d.items.length === 0 ? (
        <Empty>{name || method || hub ? 'No payments match these filters.' : 'No payments yet. They appear here as soon as a player pays or a coach records one.'}</Empty>
      ) : (
        <View>
          {wide ? (
            <View style={{ flexDirection: 'row', gap: u * 0.75, paddingBottom: u * 0.375 }}>
              <X s={0.72} up c={C.faint} style={{ flex: 1.3 }}>When</X>
              <X s={0.72} up c={C.faint} style={{ flex: 1.6 }}>Player</X>
              <X s={0.72} up c={C.faint} style={{ flex: 1.6 }}>Hub / branch</X>
              <X s={0.72} up c={C.faint} style={{ flex: 0.9 }}>For</X>
              <X s={0.72} up c={C.faint} style={{ flex: 1.3 }}>Method</X>
              <X s={0.72} up c={C.faint} style={{ flex: 0.9, textAlign: 'right' }}>Amount</X>
              <X s={0.72} up c={C.faint} style={{ flex: 0.7, textAlign: 'right' }}>Status</X>
            </View>
          ) : null}
          {d.items.map((p, i) => <Line key={p.id} p={p} first={i === 0 && !wide} wide={wide} />)}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: u * 0.5, marginTop: u * 0.5, flexWrap: 'wrap' }}>
            <X s={0.8} c={C.faint} num>{from}–{to} of {d.total}</X>
            <View style={{ flexDirection: 'row', gap: u * 0.5 }}>
              <Button size="sm" variant="secondary" label="Newer" disabled={page === 0} onPress={() => setPage(page - 1)} />
              <Button size="sm" variant="secondary" label="Older" disabled={to >= d.total} onPress={() => setPage(page + 1)} />
            </View>
          </View>
        </View>
      )}
    </Card>
  );
}
