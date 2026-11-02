// Super Admin overview: the business at a glance. Revenue, growth, hubs and structure, never players or their results.
// Revenue, collection and outstanding come from recorded payments. Expenses and profit are not recorded anywhere, so they say so
// instead of showing zero, and growth is only drawn when the period before it has recorded revenue.

import { useState } from 'react';
import { View } from 'react-native';
import { TrendChart } from '../../ui/TrendChart';
import type { FinanceMetric, FinanceSummary, OrgHub, OrgTree } from '@nboard/shared';
import { C } from '../../theme/tokens';
import { useDevice } from '../../theme/device';
import { useGet } from '../../lib/queries';
import { RequirePermission } from '../../ui/RequirePermission';
import { Screen } from '../../ui/Screen';
import { Header } from '../../ui/Header';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { CardH, Empty, Pill, Seg, X } from '../../ui/Bits';
import { ErrorBlock, LoadingBlock } from '../../ui/States';
import { useRouter } from 'expo-router';

type Period = 'month' | 'quarter' | 'year';

const money = (m: FinanceMetric, signed = false) => {
  if (m.status !== 'available') return null;
  if (m.currency === '%') return `${signed && m.value > 0 ? '+' : ''}${m.value}%`;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: m.currency, maximumFractionDigits: 0 }).format(m.value);
};
const pillText = (m?: FinanceMetric) => (m?.status === 'awaiting_rules' ? 'Awaiting finance rules' : m?.status === 'needs_history' ? 'Needs history' : 'Not configured');

function Kpi({ label, m, sub, pill }: { label: string; m?: FinanceMetric; sub: string; pill?: string }) {
  const { u } = useDevice();
  const v = m ? money(m, label === 'Growth') : null;
  return (
    <Card style={{ flexGrow: 1, flexBasis: u * 14, minWidth: 0 }}>
      <X s={0.78} up c={C.faint}>{label}</X>
      {v ? <X s={1.7} w="x" num style={{ marginTop: u * 0.25 }}>{v}</X> : (
        <View style={{ marginTop: u * 0.5 }}><Pill t="warn">{pill ?? pillText(m)}</Pill></View>
      )}
      <X s={0.78} c={C.sub} style={{ marginTop: u * 0.25 }}>{!v && m && m.status !== 'available' && m.status === 'needs_history' ? m.note : sub}</X>
    </Card>
  );
}

const structureText = (h: OrgHub) => {
  const branches = h.branches.length + h.academies.reduce((n, a) => n + a.branches.length, 0);
  if (!h.academies.length && !branches) return 'Single location';
  if (h.academies.length) return `${h.academies.length} ${h.academies.length === 1 ? 'academy' : 'academies'} · ${branches} ${branches === 1 ? 'branch' : 'branches'}`;
  return `${branches} ${branches === 1 ? 'branch' : 'branches'}, no academy`;
};

function Overview() {
  const { u, wide } = useDevice();
  const router = useRouter();
  const [showAll, setShowAll] = useState(false);
  const [period, setPeriod] = useState<Period>('month');
  const fin = useGet<FinanceSummary>('/finance/summary', { period });
  const org = useGet<OrgTree>('/org/tree');
  const d = fin.data;
  const tree = org.data;
  const hubRows = d?.rows.filter((r) => r.level === 'hub') ?? [];
  const revOf = (id: string) => { const r = hubRows.find((x) => x.hub.id === id); return r && r.revenue.status === 'available' ? r.revenue.value : -1; };
  const ranked = tree ? [...tree.hubs].sort((a, b) => revOf(b.id) - revOf(a.id) || a.name.localeCompare(b.name)) : [];
  const unconfigured = d ? !d.capabilities.revenue : false;
  const activeHubs = tree?.hubs.filter((h) => h.is_active).length ?? 0;

  return (
    <View>
      <Header title="Overview" />
      <View style={{ height: u * 0.75 }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: u * 0.75, marginBottom: u }}>
        <Seg<Period> items={[['month', 'Monthly'], ['quarter', 'Quarterly'], ['year', 'Yearly']]} value={period} onChange={setPeriod} />
        {d ? <Pill>{d.period.label}</Pill> : null}
        {tree ? <Pill>{`${activeHubs} ${activeHubs === 1 ? 'hub' : 'hubs'} · ${tree.totals.branches} ${tree.totals.branches === 1 ? 'branch' : 'branches'} · ${tree.totals.active_players} active players`}</Pill> : null}
      </View>
      {fin.isLoading || org.isLoading ? <LoadingBlock label="Loading overview" /> : fin.isError ? <ErrorBlock error={fin.error} onRetry={() => void fin.refetch()} /> : org.isError ? <ErrorBlock error={org.error} onRetry={() => void org.refetch()} /> : d && tree ? (
        <View style={{ gap: u }}>
          {unconfigured ? (
            <Card>
              <X s={0.95} w="b">Awaiting finance configuration</X>
              <X s={0.85} c={C.sub} style={{ marginTop: u * 0.25 }}>No fee plans exist yet, so no revenue is shown and none is estimated. Add fee plans on the Finance page, then put players on a plan. Hubs, academies and branches below are live.</X>
            </Card>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: u }}>
            <Kpi label="Total revenue" m={d.totals.revenue} sub={period === 'month' ? 'All hubs, month to date' : period === 'quarter' ? 'All hubs, quarter to date' : 'All hubs, year to date'} />
            <Kpi label="Expenses" m={d.totals.expenses} sub="Rent, coach pay, equipment, marketing" />
            <Kpi label="Profit" m={d.totals.profit} sub="Revenue minus expenses" />
            <Kpi label="Growth" m={d.totals.growth} sub={period === 'month' ? 'Same days last month' : period === 'quarter' ? 'Same days last quarter' : 'Same days last year'} />
            <Kpi label="Collection" m={d.totals.collection} sub="Of fees due, paid" pill="Awaiting data" />
            <Kpi label="Outstanding" m={d.totals.outstanding} sub="Fees due and not yet paid" pill="Awaiting data" />
            {d.totals.top_hub ? <Kpi label="Top hub" m={{ status: 'available', value: d.totals.top_hub.revenue, currency: 'INR' }} sub={d.totals.top_hub.name} /> : <Kpi label="Top hub" sub="Ranks once revenue exists" pill="Awaiting data" />}
            {d.totals.lowest_hub ? <Kpi label="Lowest hub" m={{ status: 'available', value: d.totals.lowest_hub.revenue, currency: 'INR' }} sub={d.totals.lowest_hub.name} /> : <Kpi label="Lowest hub" sub="Needs two hubs with revenue" pill="Awaiting data" />}
          </View>

          <Card>
            <CardH em={period === 'month' ? 'last 12 months' : period === 'quarter' ? 'last 8 quarters' : 'by year'}>Revenue, expenses and profit</CardH>
            {d.trend.some((t) => (t.revenue ?? 0) > 0) ? (
              <TrendChart
                labels={d.trend.map((t) => t.label)}
                longLabels={d.trend.map((t) => t.long)}
                selected={d.trend.findIndex((t) => t.current)}
                series={[
                  { key: 'rev', label: 'Revenue', color: C.primary, values: d.trend.map((t) => t.revenue), area: true },
                  ...(d.trend.some((t) => t.expenses !== null) ? [
                    { key: 'exp', label: 'Expenses', color: C.faint, values: d.trend.map((t) => t.expenses), dash: '6 5' },
                    { key: 'pro', label: 'Profit', color: C.success, values: d.trend.map((t) => t.profit) },
                  ] : []),
                ]}
              />
            ) : (
              <Empty>No revenue recorded yet. Trends are drawn only from recorded payments, never projected.</Empty>
            )}
          </Card>

          <View style={wide ? { flexDirection: 'row', alignItems: 'flex-start', gap: u } : { gap: u }}>
            <View style={{ flex: 1.7, minWidth: 0, width: '100%' }}>
              <Card>
                <CardH em={`${ranked.length} ${ranked.length === 1 ? 'hub' : 'hubs'}, highest revenue first`}>Hubs</CardH>
                {ranked.length === 0 ? <Empty>No hubs yet. Create one on the Hubs page.</Empty> : ranked.slice(0, showAll ? undefined : 6).map((h) => {
                  const r = hubRows.find((x) => x.hub.id === h.id);
                  return (
                    <View key={h.id} style={{ paddingVertical: u * 0.625, borderTopWidth: 1, borderTopColor: C.border, gap: u * 0.25 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.5 }}>
                        <X s={0.95} w="b" style={{ flex: 1, minWidth: 0 }} numberOfLines={2}>{h.name}</X>
                        {r && money(r.revenue) ? <X s={0.95} w="x" num>{money(r.revenue)}</X> : null}
                        <Pill t={h.is_active ? 'good' : 'off'}>{h.is_active ? 'Active' : 'Closed'}</Pill>
                      </View>
                      <X s={0.8} c={C.sub}>{structureText(h)}</X>
                      <X s={0.8} c={h.managers.length ? C.sub : C.faint}>{h.managers.length ? `Hub Admin: ${h.managers.map((m) => m.name).join(', ')}` : 'No Hub Admin (run by its Branch Admin)'}</X>
                      <View style={{ flexDirection: 'row', gap: u * 0.5, flexWrap: 'wrap' }}>
                        <Pill>{r && money(r.growth, true) ? `Growth ${money(r.growth, true)}` : 'Growth: needs history'}</Pill>
                        {r && money(r.collection) ? <Pill>{`Collected ${r.collection.status === 'available' ? r.collection.value : 0}%`}</Pill> : null}
                      </View>
                    </View>
                  );
                })}
                {ranked.length > 6 ? <Button size="sm" variant="ghost" label={showAll ? 'Show fewer' : `Show all ${ranked.length} hubs`} onPress={() => setShowAll(!showAll)} /> : null}
              </Card>
            </View>
            <View style={{ flex: 1, minWidth: 0, width: '100%' }}>
              <Card>
                <CardH em={d.totals.expenses.status === 'available' ? d.period.label : 'not recorded yet'}>Expenses and net profit</CardH>
                <View style={{ gap: u * 0.5 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: u * 0.5 }}>
                    <X s={0.9} c={C.sub} style={{ flex: 1 }}>Revenue</X>
                    {money(d.totals.revenue) ? <X s={0.95} w="b" num>{money(d.totals.revenue)}</X> : <Pill t="warn">Not configured</Pill>}
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: u * 0.5 }}>
                    <X s={0.9} c={C.sub} style={{ flex: 1 }}>Total expenses</X>
                    {money(d.totals.expenses) ? <X s={0.95} w="b" num>{money(d.totals.expenses)}</X> : <Pill t="warn">Not configured</Pill>}
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: u * 0.5, borderTopWidth: 1, borderTopColor: C.border, paddingTop: u * 0.5 }}>
                    <X s={0.9} w="b" style={{ flex: 1 }}>Net profit / loss</X>
                    {money(d.totals.profit) ? <X s={1.05} w="x" num c={d.totals.profit.status === 'available' && d.totals.profit.value < 0 ? C.warning : C.success}>{money(d.totals.profit)}</X> : <Pill t="warn">Awaiting finance rules</Pill>}
                  </View>
                </View>
                <View style={{ marginTop: u * 0.75, gap: u * 0.5 }}>
                  <Button full variant="secondary" label="Open finance" onPress={() => router.replace('/finance' as never)} />
                  <Button full variant="secondary" label="Organization" onPress={() => router.replace('/organization' as never)} />
                </View>
              </Card>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export default function Business() {
  return (
    <RequirePermission any={['VIEW_FINANCE']}>
      <Screen testID="screen-business" maxWidth={100000}>
        <Overview />
      </Screen>
    </RequirePermission>
  );
}
