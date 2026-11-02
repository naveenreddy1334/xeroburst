// Finance: Super Admin only. Revenue, collection and outstanding come from the payments players make against their fee plan.
// Expenses are not recorded anywhere yet, so expenses and profit say so instead of showing 0. Fee plans are set up here.

import { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { FeePlanDTO, FinanceMetric, FinanceRow, FinanceSummary } from '@nboard/shared';
import { C } from '../../theme/tokens';
import { useDevice } from '../../theme/device';
import { api } from '../../lib/api';
import { useGet } from '../../lib/queries';
import { rupees } from '../../lib/format';
import { useAction } from '../../staff/players-common';
import { Button } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { RequirePermission } from '../../ui/RequirePermission';
import { Screen } from '../../ui/Screen';
import { Header } from '../../ui/Header';
import { Card } from '../../ui/Card';
import { CardH, Empty, Pill, Seg, X } from '../../ui/Bits';
import { ErrorBlock, LoadingBlock } from '../../ui/States';

type Period = 'month' | 'quarter' | 'year';

const money = (m: FinanceMetric) => {
  if (m.status !== 'available') return null;
  if (m.currency === '%') return `${Math.round(m.value * 10) / 10}%`;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: m.currency, maximumFractionDigits: 0 }).format(m.value);
};

function Metric({ label, m, hint }: { label: string; m: FinanceMetric; hint?: string }) {
  const { u } = useDevice();
  const v = money(m);
  return (
    <Card style={{ flexGrow: 1, flexBasis: u * 14, minWidth: 0 }}>
      <X s={0.78} up c={C.faint}>{label}</X>
      {v ? <X s={1.7} w="x" num style={{ marginTop: u * 0.25 }}>{v}</X> : (
        <View style={{ marginTop: u * 0.375, gap: u * 0.25 }}>
          <Pill t="warn">{m.status === 'awaiting_rules' ? 'Awaiting finance rules' : m.status === 'needs_history' ? 'Needs history' : 'Not configured'}</Pill>
        </View>
      )}
      {hint ? <X s={0.75} c={C.faint}>{hint}</X> : null}
    </Card>
  );
}

function Count({ label, n }: { label: string; n: number }) {
  const { u } = useDevice();
  return (
    <Card style={{ flexGrow: 1, flexBasis: u * 14, minWidth: 0 }}>
      <X s={0.78} up c={C.faint}>{label}</X>
      <X s={1.7} w="x" num style={{ marginTop: u * 0.25 }}>{n}</X>
    </Card>
  );
}

function Cell({ m }: { m: FinanceMetric }) {
  const v = money(m);
  return v ? <X s={0.85} w="m" num style={{ flex: 1.2, textAlign: 'right' }}>{v}</X> : <X s={0.78} c={C.faint} style={{ flex: 1.2, textAlign: 'right' }}>{m.status === 'awaiting_rules' ? 'Awaiting rules' : m.status === 'needs_history' ? 'Needs history' : 'Not configured'}</X>;
}

function Row({ r, indent }: { r: FinanceRow; indent: boolean }) {
  const { u } = useDevice();
  return (
    <View style={{ flexDirection: 'row', gap: u * 0.5, alignItems: 'center', paddingVertical: u * 0.5, borderTopWidth: 1, borderTopColor: C.border, paddingLeft: indent ? u * 1.25 : 0 }}>
      <View style={{ flex: 2, minWidth: 0 }}>
        <X s={0.9} w={indent ? 'm' : 'b'} numberOfLines={2}>{r.label}</X>
        {r.academy ? <X s={0.72} c={C.faint} numberOfLines={1}>{r.academy.name}</X> : null}
      </View>
      <X s={0.85} num style={{ flex: 0.8, textAlign: 'right' }}>{r.players}</X>
      <Cell m={r.revenue} />
      <Cell m={r.expenses} />
      <Cell m={r.profit} />
    </View>
  );
}

/** Fee plans: what a player pays XeroBurst each month. Players are put on a plan from their profile. */
function PlansCard() {
  const { u } = useDevice();
  const plans = useGet<{ items: FeePlanDTO[] }>('/fee-plans');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const act = useAction(['/fee-plans', '/finance']);
  async function add() {
    const n = Number(amount);
    if (!name.trim() || !Number.isInteger(n) || n < 0) return;
    const r = await act.run('add', () => api.post('/fee-plans', { name: name.trim(), amount: n }), 'Plan added.');
    if (r.ok) { setName(''); setAmount(''); }
  }
  return (
    <Card>
      <CardH em="monthly, in rupees">Fee plans</CardH>
      {plans.isLoading ? <LoadingBlock label="Loading plans" /> : plans.isError ? <ErrorBlock error={plans.error} onRetry={() => void plans.refetch()} /> : !plans.data?.items.length ? (
        <Empty>No fee plans yet. Add one below, then put players on it from their profile. Revenue appears once payments are made.</Empty>
      ) : (
        <View>
          {plans.data.items.map((p) => (
            <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.5, paddingVertical: u * 0.5, borderTopWidth: 1, borderTopColor: C.border, opacity: p.is_active ? 1 : 0.55 }}>
              <X s={0.92} w="b" style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>{p.name}</X>
              <X s={0.92} num>{rupees(p.amount)}</X>
              <Button size="sm" variant="ghost" label={p.is_active ? 'Retire' : 'Reactivate'} onPress={() => void act.run('t' + p.id, () => api.patch(`/fee-plans/${p.id}`, { is_active: !p.is_active }), p.is_active ? 'Plan retired.' : 'Plan active again.')} />
            </View>
          ))}
        </View>
      )}
      <View style={{ marginTop: u * 0.75, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: u * 0.5 }}>
        <View style={{ flex: 1, flexBasis: u * 10, minWidth: 0 }}><Field inline label="Plan name" value={name} onChangeText={setName} autoCapitalize="words" maxLength={40} error={act.fields.name} /></View>
        <View style={{ flexBasis: u * 9 }}><Field inline label="Rupees a month" value={amount} onChangeText={(t) => setAmount(t.replace(/\D/g, ''))} keyboardType="number-pad" tvKeyboard="numeric" maxLength={7} error={act.fields.amount} /></View>
        <View><Button style={{ minHeight: u * 3.2 }} label="Add plan" loading={act.busy === 'add'} disabled={!name.trim() || !amount} onPress={() => void add()} /></View>
      </View>
    </Card>
  );
}

function FinanceScreen() {
  const { u } = useDevice();
  const [period, setPeriod] = useState<Period>('month');
  const [hubId, setHubId] = useState<string | null>(null);
  const f = useGet<FinanceSummary>('/finance/summary', { period });
  const d = f.data;
  const unconfigured = d ? !d.capabilities.revenue : false;
  const hubRows = d?.rows.filter((r) => r.level === 'hub') ?? [];

  return (
    <View>
      <Header eyebrow="Super Admin" title="Finance" subtitle="Platform-wide revenue and costs by hub, academy and branch." />
      <View style={{ height: u * 0.75 }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: u * 0.75, marginBottom: u }}>
        <Seg<Period> items={[['month', 'Monthly'], ['quarter', 'Quarterly'], ['year', 'Yearly']]} value={period} onChange={setPeriod} />
        {d ? <Pill>{d.period.label}</Pill> : null}
      </View>
      {f.isLoading ? <LoadingBlock label="Loading finance" /> : f.isError ? <ErrorBlock error={f.error} onRetry={() => void f.refetch()} /> : d ? (
        <View style={{ gap: u }}>
          {unconfigured ? (
            <Card>
              <X s={0.95} w="b">No financial data available</X>
              <X s={0.85} c={C.sub} style={{ marginTop: u * 0.25 }}>No fee plans exist yet, so revenue is shown as not configured rather than zero. Add a plan below. Player and branch counts are live.</X>
            </Card>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: u }}>
            <Metric label="Total revenue" m={d.totals.revenue} />
            <Metric label="Total expenses" m={d.totals.expenses} />
            <Metric label="Net profit / loss" m={d.totals.profit} />
            <Count label="Total players" n={d.totals.players} />
            <Count label="Hubs" n={d.totals.hubs} />
            <Metric label="Revenue per player" m={d.totals.revenue_per_player} />
            <Metric label="Collection" m={d.totals.collection} hint="Of fees due, paid" />
            <Metric label="Outstanding" m={d.totals.outstanding} hint="Fees due, not yet paid" />
            <Metric label="Growth" m={d.totals.growth} hint="Same days in the period before" />
          </View>
          <PlansCard />
          <Card>
            <CardH em="tap a hub to drill down">Revenue by organization</CardH>
            <View style={{ flexDirection: 'row', gap: u * 0.5, paddingBottom: u * 0.375 }}>
              <X s={0.72} up c={C.faint} style={{ flex: 2 }}>Hub / branch</X>
              <X s={0.72} up c={C.faint} style={{ flex: 0.8, textAlign: 'right' }}>Players</X>
              <X s={0.72} up c={C.faint} style={{ flex: 1.2, textAlign: 'right' }}>Revenue</X>
              <X s={0.72} up c={C.faint} style={{ flex: 1.2, textAlign: 'right' }}>Expenses</X>
              <X s={0.72} up c={C.faint} style={{ flex: 1.2, textAlign: 'right' }}>Profit</X>
            </View>
            {hubRows.length === 0 ? <Empty>No hubs yet.</Empty> : hubRows.map((h) => (
              <View key={h.hub.id}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Show branches of ${h.label}`} onPress={() => setHubId(hubId === h.hub.id ? null : h.hub.id)}>
                  <Row r={h} indent={false} />
                </Pressable>
                {hubId === h.hub.id ? (d.rows.filter((r) => r.level !== 'hub' && r.hub.id === h.hub.id).length ? d.rows.filter((r) => r.level !== 'hub' && r.hub.id === h.hub.id).map((r) => <Row key={r.branch?.id ?? r.label} r={r} indent />) : <X s={0.8} c={C.faint} style={{ paddingVertical: u * 0.5, paddingLeft: u * 1.25 }}>This hub has no branches.</X>) : null}
              </View>
            ))}
          </Card>
          <Card>
            <CardH>What is live</CardH>
            <View style={{ gap: u * 0.375 }}>
              {d.planned.map((p) => (
                <View key={p.key} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: u * 0.5 }}>
                  <X s={0.88} c={C.sub} style={{ flex: 1, minWidth: 0 }}>{p.label}</X>
                  <Pill t={p.ready ? 'good' : 'off'}>{p.ready ? 'Live' : 'Not configured'}</Pill>
                </View>
              ))}
            </View>
          </Card>
        </View>
      ) : null}
    </View>
  );
}

export default function Finance() {
  return (
    <RequirePermission any={['VIEW_FINANCE']}>
      <Screen testID="screen-finance" maxWidth={100000}>
        <FinanceScreen />
      </Screen>
    </RequirePermission>
  );
}
