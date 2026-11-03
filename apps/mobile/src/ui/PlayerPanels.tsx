// A player's streak, rounds goal ("ghost") and fees. The same three cards are used on the player's own Progress page and on the
// profile a coach, manager or Super Admin opens, so both always agree.
//
//  Streak: days in a row with at least one completed round.
//  Goal:   the player (or coach) sets how many rounds they want this week or month. The ghost line paces that target evenly over
//          the days, the solid line is what was actually played, the dotted line is where the current pace will end.
//  Fees:   the plan, what is owed, a Pay now with UPI, card or net banking, and the payment history. No real gateway is connected,
//          so the card says that plainly.

import { useEffect, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import type { BillingDTO, FeePlanDTO, PaymentMethod, ProgressDTO, TargetPeriod } from '@nboard/shared';
import { C, F } from '../theme/tokens';
import { glassLo } from '../theme/surfaces';
import { useDevice } from '../theme/device';
import { api } from '../lib/api';
import { useGet } from '../lib/queries';
import { fmtFull, rupees } from '../lib/format';
import { useAuth } from '../state/auth';
import { useAction } from '../staff/players-common';
import { Card } from './Card';
import { Button } from './Button';
import { Field } from './Field';
import { Dialog } from './Dialog';
import { CardH, Empty, Facts, Pill, RoundChip, Seg, X } from './Bits';
import { ErrorBlock, LoadingBlock } from './States';

const METHOD_LABEL: Record<PaymentMethod, string> = { upi: 'UPI', card: 'Card', netbanking: 'Net banking', cash: 'Cash' };
const GHOST = '#9A8C68';

// ---- streak ---------------------------------------------------------------------------------------------------------

const MILESTONES = [3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 365];
const WEEKDAYS = ['M', '', 'W', '', 'F', '', ''];

/** How a day looks on the calendar: none, one round, two, three or more. */
const shade = (rounds: number) => (rounds <= 0 ? 0 : rounds === 1 ? 0.4 : rounds === 2 ? 0.7 : 1);

export function StreakCard({ p }: { p: ProgressDTO }) {
  const { u } = useDevice();
  const s = p.streak;
  const next = MILESTONES.find((m) => m > s.current) ?? null;
  const toGo = next ? next - s.current : 0;
  const msg = s.current === 0 ? 'Play a round today to start a streak.' : s.current === 1 ? 'One day. Come back tomorrow to make it two.' : `${s.current} days in a row. Keep it going.`;

  // Weeks as columns, Monday at the top. The first column is padded so every day sits on its own weekday.
  const days = s.last56;
  const first = new Date(`${days[0]!.day}T00:00:00Z`).getUTCDay();
  const lead = (first + 6) % 7;
  const cells: ({ day: string; rounds: number } | null)[] = [...Array(lead).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  const [gw, setGw] = useState(0);
  const gap = u * 0.25;
  const labelW = u * 1.2;
  // cells grow to fill the card width (capped so a TV does not get giant blocks)
  const fit = gw > 0 ? (gw - labelW - u * 0.4 * weeks.length - 1) / weeks.length : 0;
  const cell = gw > 0 ? Math.max(18, Math.min(fit, u * 2.6)) : Math.max(18, u * 1.45);
  const today = days[days.length - 1]!.day;

  return (
    <Card>
      <CardH em={`best ${s.longest} ${s.longest === 1 ? 'day' : 'days'}`}>Streak</CardH>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.9 }}>
        <View style={{ width: u * 5, height: u * 5, borderRadius: u * 2.5, alignItems: 'center', justifyContent: 'center', backgroundColor: s.current ? C.primary : C.tint }}>
          <X s={2} w="x" num c={s.current ? C.onPrimary : C.faint}>{s.current}</X>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <X s={1.15} w="b">day streak</X>
          <X s={0.85} c={C.sub}>{msg}</X>
        </View>
      </View>

      {next ? (
        <View style={{ marginTop: u * 0.75, gap: u * 0.3 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <X s={0.8} c={C.sub}>Next: {next}-day streak</X>
            <X s={0.8} c={C.faint} num>{toGo} {toGo === 1 ? 'day' : 'days'} to go</X>
          </View>
          <View style={{ height: u * 0.5, borderRadius: u * 0.25, backgroundColor: C.tint, overflow: 'hidden' }}>
            <View style={{ width: `${Math.min(100, Math.round((s.current / next) * 100))}%`, height: '100%', backgroundColor: C.primary, borderRadius: u * 0.25 }} />
          </View>
        </View>
      ) : null}

      <View style={{ marginTop: u * 0.9 }}>
        <Facts items={[
          ['Days played, last 30', `${s.active_30} of 30`],
          ['Rounds, last 30 days', String(s.rounds_30)],
          ['Best streak', `${s.longest} ${s.longest === 1 ? 'day' : 'days'}`],
          ['Rounds, all time', String(s.total_rounds)],
        ]} />
      </View>

      <X s={0.72} up c={C.faint} style={{ marginTop: u * 0.9, marginBottom: u * 0.4 }}>Last 8 weeks</X>
      <View onLayout={(e: LayoutChangeEvent) => setGw(Math.round(e.nativeEvent.layout.width))} style={{ flexDirection: 'row', gap: u * 0.4 }} accessibilityLabel={`Last 8 weeks: ${days.filter((d) => d.rounds > 0).length} days played`}>
        <View style={{ gap: gap, width: labelW }}>
          {WEEKDAYS.map((w, i) => <View key={i} style={{ height: cell, justifyContent: 'center' }}><X s={0.7} c={C.faint}>{w}</X></View>)}
        </View>
        {weeks.map((col, wi) => (
          <View key={wi} style={{ gap }}>
            {col.map((d, di) => (
              <View
                key={di}
                accessibilityLabel={d ? `${d.day}: ${d.rounds} ${d.rounds === 1 ? 'round' : 'rounds'}` : undefined}
                style={{ width: cell, height: cell, borderRadius: Math.max(4, cell * 0.28), backgroundColor: d ? (d.rounds > 0 ? C.primary : C.tint) : 'transparent', opacity: d ? (d.rounds > 0 ? 0.35 + 0.65 * shade(d.rounds) : 0.8) : 1, borderWidth: d?.day === today ? 1.5 : 0, borderColor: C.highlight }}
              />
            ))}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.3, marginTop: u * 0.5 }}>
        <X s={0.72} c={C.faint}>Less</X>
        {[0, 1, 2, 3].map((r) => <View key={r} style={{ width: cell * 0.6, height: cell * 0.6, borderRadius: 3, backgroundColor: r ? C.primary : C.tint, opacity: r ? 0.35 + 0.65 * shade(r) : 0.8 }} />)}
        <X s={0.72} c={C.faint}>More rounds in a day</X>
      </View>
    </Card>
  );
}

// ---- goal chart -----------------------------------------------------------------------------------------------------

/** Target pace (ghost), rounds played (solid) and the projection (dotted), as running totals across the days of the period. */
function GhostChart({ per }: { per: TargetPeriod }) {
  const { u } = useDevice();
  const [w, setW] = useState(320);
  const h = Math.max(150, u * 11);
  const padL = 30, padR = 10, padT = 10, padB = 22;
  const innerW = Math.max(40, w - padL - padR);
  const innerH = h - padT - padB;
  const n = per.series.length;
  const top = Math.max(1, per.target ?? 0, per.projected_total, ...per.series.map((s) => s.actual ?? 0));
  const max = Math.ceil((top * 1.1) / 5) * 5 || 5;
  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + (1 - v / max) * innerH;
  const line = (vals: (number | null)[]) => {
    let d = '';
    let pen = false;
    vals.forEach((v, i) => {
      if (v === null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
      pen = true;
    });
    return d;
  };
  const ghost = line(per.target ? per.series.map((s) => s.ghost) : []);
  const actual = line(per.series.map((s) => s.actual));
  const proj = line(per.series.map((s) => s.projected));
  const lastActual = [...per.series].reverse().find((s) => s.actual !== null);
  const lastIdx = lastActual ? per.series.indexOf(lastActual) : -1;
  const ticks = [0, Math.round(max / 2), max];
  const labelEvery = per.kind === 'month' ? 7 : 1;
  return (
    <View onLayout={(e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width))} accessibilityLabel={`Rounds across ${per.label}. Target ${per.target ?? 'not set'}, played ${per.actual}, projected ${per.projected_total}.`}>
      <Svg width={w} height={h}>
        {ticks.map((t) => (
          <Line key={`g${t}`} x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke={C.border} strokeWidth={1} />
        ))}
        {ticks.map((t) => (
          <SvgText key={`t${t}`} x={padL - 6} y={y(t) + 4} fontSize={10} fill={C.faint} textAnchor="end" fontFamily={F.body}>{t}</SvgText>
        ))}
        {per.series.map((s, i) => (i % labelEvery === 0 || i === n - 1 ? (
          <SvgText key={s.day} x={x(i)} y={h - 6} fontSize={10} fill={C.faint} textAnchor="middle" fontFamily={F.body}>{s.label}</SvgText>
        ) : null))}
        {ghost ? <Path d={ghost} stroke={GHOST} strokeWidth={2} strokeDasharray="2 5" strokeLinecap="round" fill="none" /> : null}
        {proj ? <Path d={proj} stroke={C.cyan} strokeWidth={2} strokeDasharray="7 5" fill="none" opacity={0.9} /> : null}
        {actual ? <Path d={actual} stroke={C.primary} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" fill="none" /> : null}
        {lastIdx >= 0 ? <Circle cx={x(lastIdx)} cy={y(lastActual!.actual!)} r={4.5} fill={C.highlight} /> : null}
      </Svg>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: u * 1, marginTop: u * 0.25 }}>
        <Legend color={GHOST} dash="dot" label="Target pace (ghost)" />
        <Legend color={C.primary} label="Played" />
        {per.is_current && per.elapsed_days >= 3 && per.elapsed_days < per.days ? <Legend color={C.cyan} dash="dash" label="Predicted at this pace" /> : null}
      </View>
    </View>
  );
}

function Legend({ color, label, dash }: { color: string; label: string; dash?: 'dot' | 'dash' }) {
  const { u } = useDevice();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.4 }}>
      <View style={{ width: u * 1.4, height: 0, borderTopWidth: 3, borderColor: color, borderStyle: dash === 'dot' ? 'dotted' : dash === 'dash' ? 'dashed' : 'solid' }} />
      <X s={0.75} c={C.sub}>{label}</X>
    </View>
  );
}

function statusOf(per: TargetPeriod): { t: 'good' | 'warn' | 'off'; text: string } {
  if (per.target === null) return { t: 'off', text: 'No goal set' };
  if (!per.is_current) return per.actual >= per.target ? { t: 'good', text: 'Goal hit' } : { t: 'warn', text: 'Goal missed' };
  if (per.actual >= per.target) return { t: 'good', text: 'Goal reached' };
  if (per.on_track === null) return { t: 'off', text: 'Just started' };
  return per.on_track ? { t: 'good', text: 'On track' } : { t: 'warn', text: 'Behind pace' };
}

export function GoalCard({ playerId }: { playerId: string }) {
  const { u } = useDevice();
  const [kind, setKind] = useState<'week' | 'month'>('month');
  const [offset, setOffset] = useState(0);
  const q = useGet<ProgressDTO>(`/players/${playerId}/progress`, { kind, offset });
  const [val, setVal] = useState('');
  const act = useAction([`/players/${playerId}/progress`]);
  const d = q.data;
  const per = d?.period;
  useEffect(() => { setVal(per?.target ? String(per.target) : ''); }, [per?.target, per?.start, kind]);

  async function save() {
    const n = Number(val);
    if (!Number.isInteger(n) || n < 1) return;
    await act.run('save', () => api.put(`/players/${playerId}/target`, { kind, target_rounds: n }), `Goal saved: ${n} rounds.`);
  }

  const st = per ? statusOf(per) : null;
  const unit = kind === 'week' ? 'week' : 'month';
  const suggestion = d?.history[0] ? Math.max(1, Math.round(d.history[0].actual * 1.1)) : null;

  return (
    <Card>
      <CardH em={per?.label}>Goal and pace</CardH>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: u * 0.5, marginBottom: u * 0.75 }}>
        <Seg<'week' | 'month'> items={[['week', 'Week'], ['month', 'Month']]} value={kind} onChange={(k) => { setKind(k); setOffset(0); }} />
        <View style={{ flexDirection: 'row', gap: u * 0.4 }}>
          <Button size="sm" variant="secondary" label="Earlier" onPress={() => setOffset(offset - 1)} disabled={offset <= -24} />
          <Button size="sm" variant="secondary" label="Later" onPress={() => setOffset(Math.min(0, offset + 1))} disabled={offset === 0} />
        </View>
      </View>
      {q.isLoading ? <LoadingBlock label="Loading goal" /> : q.isError || !d || !per ? <ErrorBlock error={q.error} onRetry={() => void q.refetch()} /> : (
        <View style={{ gap: u * 0.75 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.5, flexWrap: 'wrap' }}>
            {st ? <Pill t={st.t}>{st.text}</Pill> : null}
            {per.is_current ? <X s={0.8} c={C.faint}>Day {per.elapsed_days} of {per.days}</X> : <X s={0.8} c={C.faint}>Finished</X>}
          </View>
          <Facts items={[
            ['Goal', per.target === null ? 'Not set' : `${per.target} rounds`],
            ['Played', `${per.actual} rounds`],
            [per.is_current && per.elapsed_days < per.days ? 'Predicted finish' : 'Final', per.is_current && per.elapsed_days < 3 ? 'After day 3' : `${per.projected_total} rounds`],
            ['Left to go', per.target === null ? '--' : per.actual >= per.target ? 'Done' : `${per.target - per.actual} rounds`],
          ]} />
          {per.target === null && !per.is_current ? <Empty>No goal was set for this {unit}. The line shows what was played.</Empty> : null}
          <GhostChart per={per} />
          {per.is_current && d.can_set ? (
            <View style={[{ borderRadius: u, padding: u * 0.75, gap: u * 0.25 }, glassLo()]}>
              <X s={0.9} w="b">{per.target === null ? `Set your goal for this ${unit}` : `Change this ${unit}'s goal`}</X>
              <X s={0.8} c={C.sub}>How many rounds do you want to play this {unit}? The ghost line shows the pace you need each day.</X>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: u * 0.5, marginTop: u * 0.25 }}>
                <View style={{ flex: 1, maxWidth: u * 12 }}><Field inline label="Rounds" value={val} onChangeText={(t) => setVal(t.replace(/\D/g, ''))} keyboardType="number-pad" tvKeyboard="numeric" maxLength={4} error={act.fields.target_rounds} onSubmit={() => void save()} /></View>
                <View><Button style={{ minHeight: u * 3.2 }} label="Save goal" loading={act.busy === 'save'} disabled={!val} onPress={() => void save()} /></View>
              </View>
              {suggestion && per.target === null ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.5, flexWrap: 'wrap' }}>
                  <X s={0.78} c={C.faint}>Last {unit} you played {d.history[0]!.actual}.</X>
                  <RoundChip label={`Use ${suggestion}`} on={false} onPress={() => setVal(String(suggestion))} />
                </View>
              ) : null}
            </View>
          ) : null}
          {d.history.length ? (
            <View>
              <X s={0.72} up c={C.faint} style={{ marginBottom: u * 0.25 }}>Earlier {unit}s</X>
              {d.history.map((h) => (
                <View key={h.start} style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.5, paddingVertical: u * 0.45, borderTopWidth: 1, borderTopColor: C.border }}>
                  <X s={0.85} style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>{h.label}</X>
                  <X s={0.85} num c={C.sub}>{h.actual} / {h.target}</X>
                  <Pill t={h.hit ? 'good' : 'warn'}>{h.hit ? 'Hit' : 'Missed'}</Pill>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      )}
    </Card>
  );
}

/** Streak and goal for one player. */
export function ProgressPanels({ playerId, side }: { playerId: string; side?: boolean }) {
  const { u } = useDevice();
  const q = useGet<ProgressDTO>(`/players/${playerId}/progress`, { kind: 'month', offset: 0 });
  const streak = q.data ? <StreakCard p={q.data} /> : q.isLoading ? <LoadingBlock label="Loading streak" /> : <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;
  // Wide screens put the streak and the goal side by side.
  return side ? (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: u }}>
      <View style={{ flex: 1, minWidth: 0 }}>{streak}</View>
      <View style={{ flex: 1.2, minWidth: 0 }}><GoalCard playerId={playerId} /></View>
    </View>
  ) : (
    <View style={{ gap: u }}>
      {streak}
      <GoalCard playerId={playerId} />
    </View>
  );
}

// ---- fees ---------------------------------------------------------------------------------------------------------

const MONTH_PILL: Record<string, { t: 'good' | 'warn' | 'off' | ''; text: string }> = {
  paid: { t: 'good', text: 'Paid' },
  partial: { t: 'warn', text: 'Part paid' },
  due: { t: '', text: 'Due' },
  overdue: { t: 'warn', text: 'Overdue' },
};

/** One payment, laid out the same everywhere: amount and month on the left, date, method and reference under it, status on the right. */
function PaymentRow({ p, first }: { p: BillingDTO['payments'][number]; first: boolean }) {
  const { u } = useDevice();
  const month = monthName(p.period);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.75, paddingVertical: u * 0.6, borderTopWidth: first ? 0 : 1, borderTopColor: C.border }}>
      <View style={{ width: u * 2.6, height: u * 2.6, borderRadius: u * 0.8, alignItems: 'center', justifyContent: 'center', backgroundColor: C.tintHi }}>
        <X s={0.72} w="b" c={C.highlight}>{month.slice(0, 3).toUpperCase()}</X>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <X s={0.95} w="b" num numberOfLines={1}>{rupees(p.amount)} <X s={0.82} c={C.sub}>for {month}</X></X>
        <X s={0.74} c={C.faint} numberOfLines={2}>{fmtFull(p.paid_at ?? p.created_at)} · {METHOD_LABEL[p.method]}{p.reference ? ` · ${p.reference}` : ''}</X>
      </View>
      <Pill t={p.status === 'paid' ? 'good' : 'warn'}>{p.status === 'paid' ? 'Paid' : p.status}</Pill>
    </View>
  );
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = (ym: string) => `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1] ?? ym} ${ym.slice(0, 4)}`;

/** Payment history in its own window: payments grouped by year with the year's total, and the month by month list on a second tab. */
function HistoryDialog({ b, visible, onClose }: { b: BillingDTO; visible: boolean; onClose: () => void }) {
  const { u } = useDevice();
  const { height } = useWindowDimensions();
  const [tab, setTab] = useState<'payments' | 'months'>('payments');
  const [shown, setShown] = useState(12);
  const paid = b.payments.filter((p) => p.status === 'paid');
  const years = new Map<string, typeof b.payments>();
  for (const p of b.payments.slice(0, shown)) {
    const y = (p.paid_at ?? p.created_at).slice(0, 4);
    years.set(y, [...(years.get(y) ?? []), p]);
  }
  const yearTotal = (y: string) => paid.filter((p) => (p.paid_at ?? p.created_at).slice(0, 4) === y).reduce((a, p) => a + p.amount, 0);
  return (
    <Dialog visible={visible} title="Payment history" cancelLabel="Close" onCancel={onClose} maxWidth={620}>
      <View style={{ gap: u * 0.75 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: u * 0.5 }}>
          <Seg<'payments' | 'months'> items={[['payments', 'Payments'], ['months', 'Month by month']]} value={tab} onChange={setTab} />
          <X s={0.8} c={C.sub} num>{paid.length} {paid.length === 1 ? 'payment' : 'payments'} · {rupees(b.summary.paid)} paid</X>
        </View>
        <ScrollView style={{ maxHeight: Math.max(240, height * 0.5) }} showsVerticalScrollIndicator={false}>
          {tab === 'payments' ? (
            b.payments.length === 0 ? <Empty>No payments yet.</Empty> : (
              <View>
                {[...years.entries()].map(([y, list]) => (
                  <View key={y} style={{ marginBottom: u * 0.5 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: u * 0.4 }}>
                      <X s={0.78} up w="b" c={C.faint}>{y}</X>
                      <X s={0.78} c={C.faint} num>{rupees(yearTotal(y))} this year</X>
                    </View>
                    {list.map((p, i) => <PaymentRow key={p.id} p={p} first={i === 0} />)}
                  </View>
                ))}
                {b.payments.length > shown ? <Button size="sm" variant="ghost" label={`Show more (${b.payments.length - shown} older)`} onPress={() => setShown(shown + 12)} /> : null}
              </View>
            )
          ) : (
            <View>
              {b.months.map((m, i) => (
                <View key={m.period} style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.5, paddingVertical: u * 0.5, borderTopWidth: i ? 1 : 0, borderTopColor: C.border }}>
                  <X s={0.9} style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>{m.label}</X>
                  <X s={0.85} num c={C.sub}>{rupees(m.paid)} / {rupees(m.due)}</X>
                  <Pill t={MONTH_PILL[m.status]?.t ?? ''}>{MONTH_PILL[m.status]?.text ?? m.status}</Pill>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </Dialog>
  );
}

/** Fees at a glance with the actions as buttons: Pay now, Payment history, Change plan. Each opens its own window, so the card stays short. */
export function BillingCard({ playerId }: { playerId: string }) {
  const { u } = useDevice();
  const me = useAuth((s) => s.user);
  const self = me?.id === playerId;
  const q = useGet<BillingDTO>(`/players/${playerId}/billing`);
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [dlg, setDlg] = useState<null | 'pay' | 'history' | 'plan'>(null);
  const canPlan = !self && !!me && ['SUPER_ADMIN', 'ADMIN', 'HUB_MANAGER', 'BRANCH_MANAGER'].includes(me.role);
  const plans = useGet<{ items: FeePlanDTO[] }>('/fee-plans', undefined, { enabled: canPlan });
  const act = useAction([`/players/${playerId}`, '/finance']);
  const b = q.data;
  const owing = b?.months.filter((m) => m.paid < m.due) ?? [];
  const oldest = owing[owing.length - 1];
  const methods: PaymentMethod[] = self ? ['upi', 'card', 'netbanking'] : (b?.methods ?? []);
  const last = b?.payments.find((p) => p.status === 'paid');
  const payLabel = self ? 'Pay now' : 'Record payment';
  // Months a payment can be made for: everything owing (oldest first) and the next three months, paid in advance.
  const nowYm = b?.months[0]?.period;
  const ahead = (n: number) => { const t = new Date(Date.UTC(Number(nowYm!.slice(0, 4)), Number(nowYm!.slice(5, 7)) - 1 + n, 1)); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`; };
  const options: { period: string; label: string; amount: number; advance: boolean }[] = !b || !nowYm || b.monthly_amount === null ? [] : [
    ...[...owing].reverse().slice(0, 6).map((m) => ({ period: m.period, label: m.label, amount: m.due - m.paid, advance: false })),
    ...[1, 2, 3].map((n) => ({ period: ahead(n), label: monthName(ahead(n)), amount: b.monthly_amount!, advance: true })),
  ];
  const [pick, setPick] = useState<string | null>(null);
  const chosen = options.find((o) => o.period === pick) ?? options[0];

  async function pay() {
    if (!chosen) return;
    const r = await act.run('pay', () => api.post(`/players/${playerId}/payments`, { method, period: chosen.period }), `${self ? 'Paid' : 'Recorded'} ${rupees(chosen.amount)} for ${chosen.label}.`);
    if (r.ok) { setDlg(null); setPick(null); }
  }

  return (
    <Card>
      <CardH em={b?.plan ? `${b.plan.name} · ${rupees(b.monthly_amount ?? 0)} a month` : undefined}>Fees and payments</CardH>
      {q.isLoading ? <LoadingBlock label="Loading fees" /> : q.isError || !b ? <ErrorBlock error={q.error} onRetry={() => void q.refetch()} /> : (
        <View style={{ gap: u * 0.9 }}>
          {!b.plan ? (
            <Empty>No fee plan has been set for {self ? 'you' : 'this player'} yet.</Empty>
          ) : (
            <>
              {oldest ? (
                <View style={[{ borderRadius: u, padding: u * 0.9, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: u * 0.6 }, glassLo()]}>
                  <View style={{ flex: 1, flexBasis: u * 10, minWidth: 0 }}>
                    <X s={0.74} up c={C.faint}>Due now</X>
                    <X s={1.6} w="x" num>{rupees(oldest.due - oldest.paid)}</X>
                    <X s={0.82} c={C.sub}>for {oldest.label}{owing.length > 1 ? ` · ${owing.length - 1} more month${owing.length > 2 ? 's' : ''} after it` : ''}</X>
                  </View>
                  {b.can_pay ? <Button label={payLabel} icon="wallet" onPress={() => setDlg('pay')} /> : null}
                </View>
              ) : (
                <View style={[{ borderRadius: u, padding: u * 0.9, flexDirection: 'row', alignItems: 'center', gap: u * 0.6 }, glassLo()]}>
                  <Pill t="good">All paid up</Pill>
                  {last ? <X s={0.8} c={C.sub} style={{ flex: 1, minWidth: 0 }} numberOfLines={2}>Last payment {rupees(last.amount)} on {fmtFull(last.paid_at ?? last.created_at)}</X> : <View style={{ flex: 1 }} />}
                  {b.can_pay ? <Button label={self ? 'Make a payment' : 'Record payment'} icon="wallet" onPress={() => setDlg('pay')} /> : null}
                </View>
              )}
              <Facts items={[['Paid so far', rupees(b.summary.paid)], ['Outstanding', rupees(b.summary.outstanding)], ['Billed since', b.start_period ? (b.months[b.months.length - 1]?.label ?? b.start_period) : '--'], ['Plan', b.plan.name]]} />
            </>
          )}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: u * 0.6 }}>
            <Button variant="secondary" icon="list" label="Payment history" onPress={() => setDlg('history')} />
            {canPlan ? <Button variant="ghost" icon="edit" label={b.plan ? 'Change plan' : 'Choose a plan'} onPress={() => setDlg('plan')} /> : null}
          </View>
        </View>
      )}

      {b && chosen ? (
        <Dialog
          visible={dlg === 'pay'}
          title={self ? 'Pay your fee' : 'Record a payment'}
          confirmLabel={`${self ? 'Pay' : 'Record'} ${rupees(chosen.amount)}`}
          loading={act.busy === 'pay'}
          onConfirm={() => void pay()}
          onCancel={() => setDlg(null)}
        >
          <View style={{ gap: u * 0.75 }}>
            <View style={{ gap: u * 0.4 }}>
              <X s={0.78} up c={C.faint}>Pay for</X>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: u * 0.5 }}>
                {options.map((o) => <RoundChip key={o.period} label={o.advance ? `${o.label} (advance)` : o.label} on={chosen.period === o.period} onPress={() => setPick(o.period)} />)}
              </View>
              <X s={2} w="x" num>{rupees(chosen.amount)}</X>
            </View>
            <View style={{ gap: u * 0.4 }}>
              <X s={0.78} up c={C.faint}>{self ? 'Pay with' : 'Taken by'}</X>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: u * 0.5 }}>
                {methods.map((m) => <RoundChip key={m} label={METHOD_LABEL[m]} on={method === m} onPress={() => setMethod(m)} />)}
              </View>
            </View>
            <X s={0.74} c={C.faint}>Demo payments: no real payment gateway is connected, so no money moves. The payment is recorded in XeroBurst straight away and appears in the Super Admin's payment log.</X>
          </View>
        </Dialog>
      ) : null}

      {b ? <HistoryDialog b={b} visible={dlg === 'history'} onClose={() => setDlg(null)} /> : null}

      {b && canPlan ? (
        <Dialog visible={dlg === 'plan'} title={b.plan ? 'Change fee plan' : 'Choose a fee plan'} cancelLabel="Close" onCancel={() => setDlg(null)}>
          {plans.isLoading ? <LoadingBlock label="Loading plans" /> : !(plans.data?.items.length) ? <X s={0.85} c={C.warning}>No fee plans exist yet. The Super Admin adds them under Finance.</X> : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: u * 0.5 }}>
              {plans.data.items.filter((p) => p.is_active).map((p) => (
                <RoundChip key={p.id} label={`${p.name} ${rupees(p.amount)}`} on={b.plan?.id === p.id} onPress={() => { if (b.plan?.id !== p.id) void act.run('plan' + p.id, () => api.put(`/players/${playerId}/fee`, { plan_id: p.id }), `Plan set to ${p.name}.`).then((r) => { if (r.ok) setDlg(null); }); }} />
              ))}
            </View>
          )}
        </Dialog>
      ) : null}
    </Card>
  );
}
