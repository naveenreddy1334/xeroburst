// The Analytics screen, laid out exactly like the design: on TV a players panel and an nBoard games panel at the left and the
// analytics at the right; on a phone, player chips, game chips and the analytics below. All figures come from the server:
// the latest stored round of the chosen game (per-target rows), the round before it, the player's recent reaction times
// and the latest round of every active player (for the team average and the sparklines).

import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { GAMES, GAME_SLUGS } from '@nboard/shared';
import type { GameSlug, IconName, Page, PerformanceResponse, PlayerDetail, PlayerListItem, SessionDTO } from '@nboard/shared';
import { C } from '../theme/tokens';
import { glassLo, glassSurface, glowBox, neoIn, neoSurface } from '../theme/surfaces';
import { useDevice } from '../theme/device';
import { useGet } from '../lib/queries';
import { useAuth, useCan } from '../state/auth';
import { useRange, useSelPlayer } from '../state/shell';
import { fmtDay } from '../lib/format';
import { fmtClock, histOf, mean, median, pctDelta, rowsOf, sd, statsOf, targetsOf } from '../lib/roundStats';
import type { HitRowDTO } from '../lib/roundStats';
import { HistChart, RoundChart, TrendChart } from '../charts/RoundCharts';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Card } from './Card';
import { Empty, Facts, Pill, RoundChip, SlideTabs, ChipRow, X } from './Bits';
import { Gauge } from './Gauge';
import { GradientFill } from './Gradient';
import { Icon } from './Icon';
import { InsightsPanel } from './Insights';
import { LoadingBlock } from './States';

const TABS = ['Performance', 'Sessions', 'Comparison', 'Insights', 'Profile'];
const SOON = ['Mackworth Clock', '2 Back', 'PFTT', 'Stroop Test', '4 Choice Reaction', 'MSIT', 'Colour Shape Task', 'Task Switching'];
const GAME_ICON: Record<GameSlug, IconName> = { quick: 'bolt', memory: 'memory', hunt: 'ring2', endure: 'flame' };
const IND = '#B84AFF';

interface BoardItem { id: string; name: string; code: string; avg_rt: number | null; accuracy: number; cv: number | null; rcs: number | null; speed: number | null; score: number | null; spark: number[] }

function Spark({ data }: { data: number[] }) {
  const { u } = useDevice();
  if (data.length < 2) return <View style={{ width: u * 3.6, height: u * 1.5 }} />;
  const mn = Math.min(...data);
  const mx = Math.max(...data);
  const pts = data.map((x, i) => [(i * 60) / (data.length - 1), 19 - ((x - mn) / (mx - mn || 1)) * 15]);
  const line = 'M' + pts.map((q) => q.join(',')).join('L');
  return (
    <Svg width={u * 3.6} height={u * 1.5} viewBox="0 0 60 22" accessibilityElementsHidden>
      <Defs>
        <LinearGradient id="spk" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#B84AFF" stopOpacity={0.35} />
          <Stop offset="1" stopColor="#B84AFF" stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={`${line}L60,22L0,22Z`} fill="url(#spk)" />
      <Path d={line} fill="none" stroke="#c78bff" strokeWidth={1.5} strokeLinejoin="round" />
    </Svg>
  );
}

const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? n;
const shortName = (n: string) => { const p = n.trim().split(/\s+/); return p[0] + (p[1] ? ' ' + p[1][0] + '.' : ''); };

function GameRow({ slug, on, onPress }: { slug: GameSlug; on: boolean; onPress: () => void }) {
  const { u } = useDevice();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.625, borderRadius: u, paddingHorizontal: u * 0.625, paddingVertical: u * 0.5, overflow: 'hidden' }}>
      {on ? <GradientFill /> : null}
      <View style={{ zIndex: 1 }}><Icon name={GAME_ICON[slug]} size={u * 1.15} color={on ? '#fff' : C.idle} /></View>
      <X s={0.85} w={on ? 'b' : 'm'} c={on ? '#fff' : C.idle} style={{ flex: 1 }} numberOfLines={1}>{GAMES[slug].name}</X>
      <View style={{ zIndex: 1 }}><Icon name="chevron" size={u} color={on ? '#fff' : C.faint} /></View>
    </Pressable>
  );
}

function GamesPanel({ gi, setGi, maxH }: { gi: number; setGi: (i: number) => void; maxH?: number | string }) {
  const { u } = useDevice();
  return (
    <Card pad={0.75} style={{ minHeight: 0, maxHeight: maxH as never, flexShrink: 1 }}>
      <X s={1.1} w="b" style={{ marginBottom: u * 0.375 }}>nBoard games</X>
      <ScrollView showsVerticalScrollIndicator={false} style={{ minHeight: 0 }} contentContainerStyle={{ gap: u * 0.125 }}>
        {GAME_SLUGS.map((s, i) => <GameRow key={s} slug={s} on={i === gi} onPress={() => setGi(i)} />)}
        {SOON.map((n) => (
          <View key={n} accessibilityState={{ disabled: true }} style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.625, paddingHorizontal: u * 0.625, paddingVertical: u * 0.5 }}>
            <Icon name="clock" size={u * 1.15} color={C.faint} />
            <X s={0.85} c={C.faint} style={{ flex: 1 }} numberOfLines={1}>{n}</X>
            <View style={{ borderRadius: 999, backgroundColor: C.tint, paddingHorizontal: u * 0.5, paddingVertical: u * 0.125 }}>
              <X s={0.62} w="s" c={C.faint}>Coming soon</X>
            </View>
          </View>
        ))}
      </ScrollView>
    </Card>
  );
}

function PlayersPanel({ list, total, sel, setSel, q, setQ, team, setTeam, teams, sparks }: {
  list: PlayerListItem[]; total: number; sel: string | null; setSel: (id: string) => void; q: string; setQ: (s: string) => void;
  team: string; setTeam: (t: string) => void; teams: { id: string; name: string }[]; sparks: Record<string, number[]>;
}) {
  const { u } = useDevice();
  const router = useRouter();
  const can = useCan();
  return (
    <Card pad={0.75} style={{ flex: 1, minHeight: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: u * 0.5 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: u * 0.3 }}>
          <X s={1.1} w="b">Players</X>
          <X s={1.1} c={C.sub}>({list.length})</X>
        </View>
        {can('MANAGE_PLAYERS') ? (
          <Pressable accessibilityLabel="Add player" accessibilityRole="button" onPress={() => router.push('/players/new' as never)} style={[{ width: u * 2, height: u * 2, borderRadius: u, alignItems: 'center', justifyContent: 'center' }, neoSurface(u)]}>
            <Icon name="plus" size={u * 1.1} color={IND} />
          </Pressable>
        ) : null}
      </View>
      <View style={[{ flexDirection: 'row', alignItems: 'center', gap: u * 0.5, height: u * 2.25, borderRadius: u, paddingHorizontal: u * 0.625, marginBottom: u * 0.5 }, glassLo(), neoIn(u)]}>
        <Icon name="search" size={u} color={C.faint} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search players..." placeholderTextColor={C.faint} style={{ flex: 1, minWidth: 0, color: C.text, fontFamily: 'Manrope_500Medium', fontSize: u * 0.85, padding: 0, outlineStyle: 'none' } as never} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: u * 0.5 }} contentContainerStyle={{ gap: u * 0.25 }}>
        {[{ id: 'All', name: 'All' }, ...teams].map((t) => {
          const on = team === t.id;
          return (
            <Pressable key={t.id} onPress={() => setTeam(t.id)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[{ borderRadius: u, overflow: 'hidden', paddingHorizontal: u * 0.625, paddingVertical: u * 0.375 }, on ? null : neoSurface(u)]}>
              {on ? <GradientFill /> : null}
              <X s={0.72} w="s" c={on ? '#fff' : C.idle}>{t.name}</X>
            </Pressable>
          );
        })}
      </ScrollView>
      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ gap: u * 0.25 }}>
        {list.map((p) => {
          const on = p.id === sel;
          return (
            <Pressable key={p.id} onPress={() => setSel(p.id)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[{ flexDirection: 'row', alignItems: 'center', gap: u * 0.625, borderRadius: u * 1.25, overflow: 'hidden', paddingHorizontal: u * 0.5, paddingVertical: u * 0.375 }, on ? { boxShadow: `0 ${u * 0.5}px ${u * 1.4}px -${u * 0.6}px #672BFF` } as never : null]}>
              {on ? <GradientFill /> : null}
              <Avatar name={p.display_name} size={u * 2.75} fs={0.85 * 15} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <X s={0.85} w="b" up numberOfLines={1} style={{ letterSpacing: 0 }}>{firstName(p.display_name)}</X>
                <X s={0.7} c={on ? 'rgba(255,255,255,.7)' : C.faint}>{p.player_code.toUpperCase()}</X>
              </View>
              <Spark data={sparks[p.id] ?? []} />
            </Pressable>
          );
        })}
        {!list.length ? <View style={{ padding: u * 1.25 }}><X s={0.85} c={C.sub} style={{ textAlign: 'center' }}>No players match.</X></View> : null}
      </ScrollView>
    </Card>
  );
}

function StatTile({ icon, l, v, sb, full }: { icon: IconName; l: string; v: string; sb: string; full?: boolean }) {
  const { u } = useDevice();
  return (
    <Card pad={0.625} tone="glass" style={[{ borderRadius: u * 1.25, minWidth: 0 }, full ? { gridColumn: 'span 2' } as never : null]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.625 }}>
        <View style={{ width: u * 2.5, height: u * 2.5, borderRadius: u * 1.25, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primaryDim, boxShadow: 'inset 0 0 0 1px rgba(184,74,255,.25)' } as never}>
          <Icon name={icon} size={u * 1.2} color={IND} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <X s={0.6} w="s" up c="#c8cde0" numberOfLines={1}>{l}</X>
          <X s={1.1} w="b" num numberOfLines={1}>{v}</X>
          <X s={0.66} c={C.sub} numberOfLines={1}>{sb}</X>
        </View>
      </View>
    </Card>
  );
}

function Legend({ items }: { items: [string, string, boolean?][] }) {
  const { u } = useDevice();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: u * 0.75, rowGap: u * 0.25 }}>
      {items.map(([c, l, b]) => (
        <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.375 }}>
          <View style={{ width: u * 0.5, height: u * 0.5, borderRadius: b ? u * 0.125 : 999, backgroundColor: c, opacity: b ? 0.7 : 1 }} />
          <X s={0.7} c="#c8cde0">{l}</X>
        </View>
      ))}
    </View>
  );
}

const Sec = ({ t, sub }: { t: string; sub?: string }) => (
  <View>
    <X s={0.85} w="b" up>{t}</X>
    {sub ? <X s={0.72} c={C.sub}>{sub}</X> : null}
  </View>
);

/** Room for the AI coach. The offline insights above always work; this card is where an AI analysis will go once it is switched on. */
function AiSlot({ name }: { name: string }) {
  const { u } = useDevice();
  return (
    <Card pad={0.75} style={{ borderRadius: u * 1.6 }} testID="ai-slot">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: u * 0.5, marginBottom: u * 0.375 }}>
        <X s={0.85} w="b" up>AI coach</X>
        <Pill>Coming soon</Pill>
      </View>
      <X s={0.88} c={C.sub}>This is where an AI analysis of {name}'s rounds will appear, with a plain-language read of the trends and a suggested next session. The insights above are calculated on this server and need no internet.</X>
    </Card>
  );
}

/** Choose another player: a sheet with search, so switching works the same on a phone, a tablet and a TV remote. */
function PlayerPick({ visible, players, selId, onPick, onClose }: { visible: boolean; players: PlayerListItem[]; selId: string | null; onPick: (id: string) => void; onClose: () => void }) {
  const { u } = useDevice();
  const [q, setQ] = useState('');
  const list = players.filter((p) => !q || p.display_name.toLowerCase().includes(q.toLowerCase()) || p.player_code.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: C.scrim, justifyContent: 'center', padding: u * 1.25 }} onPress={onClose} accessibilityLabel="Close player list">
        <Pressable onPress={() => {}} style={[{ maxHeight: '80%', borderRadius: u * 1.6, padding: u, alignSelf: 'center', width: '100%', maxWidth: u * 30 }, glassSurface(u, true)]}>
          <X s={1.1} w="b" style={{ marginBottom: u * 0.5 }}>Choose a player</X>
          <View style={[{ flexDirection: 'row', alignItems: 'center', gap: u * 0.5, height: u * 2.5, borderRadius: u, paddingHorizontal: u * 0.75, marginBottom: u * 0.5 }, glassLo(), neoIn(u)]}>
            <Icon name="search" size={u} color={C.faint} />
            <TextInput value={q} onChangeText={setQ} placeholder="Search players..." placeholderTextColor={C.faint} style={{ flex: 1, minWidth: 0, color: C.text, fontFamily: 'Manrope_500Medium', fontSize: u * 0.95, padding: 0, outlineStyle: 'none' } as never} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: u * 0.25 }}>
            {list.map((p) => {
              const on = p.id === selId;
              return (
                <Pressable key={p.id} onPress={() => { onPick(p.id); setQ(''); onClose(); }} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.625, borderRadius: u * 1.25, overflow: 'hidden', paddingHorizontal: u * 0.5, paddingVertical: u * 0.5, minHeight: u * 3.2 }}>
                  {on ? <GradientFill /> : null}
                  <Avatar name={p.display_name} size={u * 2.5} fs={0.8 * 15} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <X s={0.95} w="b" c={on ? '#fff' : C.text} numberOfLines={1}>{p.display_name}</X>
                    <X s={0.72} c={on ? 'rgba(255,255,255,.75)' : C.faint}>{p.player_code.toUpperCase()}</X>
                  </View>
                </Pressable>
              );
            })}
            {!list.length ? <X s={0.9} c={C.sub} style={{ textAlign: 'center', padding: u }}>No players match.</X> : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function AnalyticsScreen() {
  const { u, tv, wide } = useDevice();
  const router = useRouter();
  const user = useAuth((s) => s.user)!;
  const can = useCan();
  const isPlayer = user.role === 'PLAYER';
  const days = useRange((s) => s.days);
  const [gi, setGi] = useState(0);
  const [tab, setTab] = useState('Performance');
  const [team, setTeam] = useState('All');
  const [q, setQ] = useState('');
  const [pick, setPick] = useState(false);
  const [vs, setVs] = useState<string[]>(['team']);
  const game = GAME_SLUGS[gi]!;
  const selId = useSelPlayer((s) => s.id);
  const setSelId = useSelPlayer((s) => s.set);

  const roster = useGet<Page<PlayerListItem>>('/players', { limit: 200 }, { enabled: !isPlayer });
  const players = useMemo(() => (roster.data?.items ?? []).filter((p) => p.status === 'active'), [roster.data]);
  const cur = isPlayer ? null : players.find((p) => p.id === selId) ?? players[0] ?? null;
  const pid = isPlayer ? user.id : cur?.id ?? null;
  const base = isPlayer ? '/me' : pid ? `/players/${pid}` : null;
  const name = isPlayer ? user.display_name : cur?.display_name ?? '';

  const board = useGet<{ items: BoardItem[] }>('/analytics/board', { game }, { enabled: !isPlayer && can('VIEW_RESULTS') });
  const sparks = useMemo(() => Object.fromEntries((board.data?.items ?? []).map((b) => [b.id, b.spark])), [board.data]);
  const results = useGet<Page<SessionDTO>>(base ? `${base}/results` : null, { game, limit: 8, status: 'played' });
  const latest = results.data?.items[0] ?? null;
  const previous = results.data?.items[1] ?? null;
  const hitsNow = useGet<{ hits: HitRowDTO[] }>(latest ? `/sessions/${latest.id}/hits` : null);
  const hitsPrev = useGet<{ hits: HitRowDTO[] }>(previous ? `/sessions/${previous.id}/hits` : null);
  const pool = useGet<{ rts: number[] }>(base ? `${base}/rts` : null, { game, days });
  const perf = useGet<PerformanceResponse>(base ? `${base}/performance` : null);
  const detail = useGet<PlayerDetail>(!isPlayer && pid ? `/players/${pid}` : null);
  const allResults = useGet<Page<SessionDTO>>(base ? `${base}/results` : null, { limit: 12, status: 'played' }, { enabled: tab === 'Sessions' });

  const T = useMemo(() => targetsOf(hitsNow.data?.hits ?? []), [hitsNow.data]);
  const S = useMemo(() => statsOf(T), [T]);
  const Sp = useMemo(() => statsOf(targetsOf(hitsPrev.data?.hits ?? [])), [hitsPrev.data]);
  const rows = useMemo(() => rowsOf(T), [T]);
  const rts = pool.data?.rts ?? [];
  const hist = useMemo(() => histOf(rts), [rts]);
  const key = `${pid}-${game}-${days}`;

  useEffect(() => { setTab('Performance'); }, [pid]);

  const teams = useMemo(() => {
    const m = new Map<string, string>();
    players.forEach((p) => p.coach && m.set(p.coach.id, p.coach.name.replace(/^coach\s+/i, '')));
    return [...m.entries()].map(([id, n]) => ({ id, name: n }));
  }, [players]);
  const list = players.filter((p) => (team === 'All' || p.coach?.id === team) && (!q || p.display_name.toLowerCase().includes(q.toLowerCase())));

  const d = (a: number, b: number | undefined) => (Sp && b !== undefined ? pctDelta(a, b) : null);
  const coachName = cur?.coach ? cur.coach.name.replace(/^coach\s+/i, '') : null;
  const weight = detail.data?.weight_kg;
  const meta = isPlayer
    ? 'Your performance'
    : [cur?.player_code.toUpperCase(), cur?.age != null ? `${cur.age} yrs` : null, weight != null ? `${weight} kg` : null, coachName ? `Team ${coachName}` : null].filter(Boolean).map((x) => String(x).replace(/ /g, '\u00a0')).join(' • ');

  const Header = (
    <Card pad={0.75} style={{ borderRadius: u * 1.6, overflow: 'visible' }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: u, rowGap: u * 0.625 }}>
        <Avatar name={name || '?'} size={u * 5} fs={1.1 * 15} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Pressable disabled={isPlayer} onPress={() => setPick(true)} accessibilityRole="button" accessibilityLabel={`Player: ${name}. Tap to change player`} style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.5, alignSelf: 'flex-start', minHeight: u * 2.25 }}>
            <X s={1.25} w="b" up>{firstName(name)}</X>
            {!isPlayer ? <Icon name="chevronDown" size={u * 1.1} color={IND} /> : null}
          </Pressable>
          <X s={0.72} c={C.sub}>{meta}</X>
        </View>
        <SlideTabs id="atab" tabs={TABS} value={tab} onChange={setTab} />
      </View>
    </Card>
  );

  const gaugeDefs = S
    ? [
        { icon: 'bolt' as IconName, val: S.avg, dec: 0, unit: 'ms', delta: d(S.avg, Sp?.avg), good: !!Sp && S.avg <= Sp.avg, label: 'Reaction Time', sub: 'Avg. response time', frac: 1 - S.avg / 1200 },
        { icon: 'gauge' as IconName, val: S.speed, dec: 2, unit: undefined, delta: d(S.speed, Sp?.speed), good: !!Sp && S.speed >= Sp.speed, label: 'Speed', sub: 'Targets / second', frac: S.speed / 3 },
        { icon: 'target' as IconName, val: S.acc, dec: 0, unit: '%', delta: d(S.acc, Sp?.acc), good: !!Sp && S.acc >= Sp.acc, label: 'Accuracy', sub: 'Correct responses', frac: S.acc / 100 },
        { icon: 'bars' as IconName, val: S.cv, dec: 0, unit: '%', delta: d(S.cv, Sp?.cv), good: !!Sp && S.cv <= Sp.cv, label: 'Variation', sub: 'Consistency (CV)', frac: S.cv / 100 },
        { icon: 'cortex' as IconName, val: S.rcs, dec: 2, unit: undefined, delta: d(S.rcs, Sp?.rcs), good: !!Sp && S.rcs >= Sp.rcs, label: 'RCS', sub: 'Reaction consistency', frac: S.rcs },
      ]
    : [];

  const gaugeRow = (g: (typeof gaugeDefs)[number], i: number) => (
    <View key={g.label} style={{ flex: 1, minWidth: 0 }}>
      <Gauge k={key} ci={i} {...g} />
    </View>
  );

  const performance = !S ? (
    <Empty>{results.isLoading || hitsNow.isLoading ? 'Loading the latest round…' : `No ${GAMES[game].name} rounds yet.${isPlayer ? ' Play one and it appears here.' : ' Rounds appear once this player has played.'}`}</Empty>
  ) : (
    <>
      <View style={{ flexDirection: 'row', gap: tv ? u * 0.625 : u * 0.375 }}>{gaugeDefs.map(gaugeRow)}</View>
      <Card pad={0.75} style={{ borderRadius: u * 1.6 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: u * 0.5, marginBottom: u * 0.25 }}>
          <Sec t="Reaction Time Through the Round" sub={`Each target response over time · ${GAMES[game].name}`} />
          <Legend items={[['#B84AFF', 'Reaction Time (ms)'], ['#35C7FF', 'Moving Average']]} />
        </View>
        <RoundChart rows={rows} height={u * (tv ? 12.5 : 13)} revealKey={key} />
      </Card>
      <View style={{ flexDirection: 'row', flexWrap: tv ? 'nowrap' : 'wrap', gap: u * 0.625 }}>
        {[
          ['bolt', 'Fastest Reaction', S.fast ? `${S.fast.rt} ms` : '--', S.fast ? `Target ${S.fast.n}` : ''],
          ['hour', 'Slowest Reaction', S.slow ? `${S.slow.rt} ms` : '--', S.slow ? `Target ${S.slow.n}${S.slow.hit ? '' : ' (Miss)'}` : ''],
          ['sigma', 'Average Reaction', `${Math.round(S.avg)} ms`, Sp ? `${pctDelta(S.avg, Sp.avg) <= 0 ? '↓ ' : '↑ '}${Math.abs(pctDelta(S.avg, Sp.avg)).toFixed(0)}% vs last session` : 'First session'],
          ['clock', 'Total Time', fmtClock(S.tot), `${S.count} targets`],
          ['target', 'Hits / Misses', `${S.hits} / ${S.miss}`, `${Math.round(S.acc)}% accuracy`],
        ].map(([ic, l, v, sb], i) => (
          <View key={l} style={tv ? { flex: 1, minWidth: 0 } : { width: i === 4 ? '100%' : '48.7%' }}>
            <StatTile icon={ic as IconName} l={l!} v={v!} sb={sb!} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: tv ? 'row' : 'column', gap: u * 0.75 }}>
        <Card pad={0.75} style={{ flex: tv ? 1.3 : undefined, minWidth: 0, borderRadius: u * 1.6 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: u * 0.5, marginBottom: u * 0.25 }}>
            <Sec t="Performance Trends" sub="Compare key metrics across the round" />
            <Legend items={[['#B84AFF', 'Reaction Time'], ['#35C7FF', 'Accuracy'], ['#FF4778', 'Speed (targets/s)']]} />
          </View>
          <TrendChart rows={rows} height={u * (tv ? 10.5 : 11)} revealKey={key + 't'} />
        </Card>
        <Card pad={0.75} style={{ flex: tv ? 1 : undefined, minWidth: 0, borderRadius: u * 1.6 }}>
          <Sec t="Reaction Time Distribution" sub={`Last ${days} days · ${rts.length} targets`} />
          <View style={{ height: u * 0.25 }} />
          <HistChart bins={hist} height={u * (tv ? 8 : 8.5)} revealKey={key + 'h'} />
          <View style={{ marginTop: u * 0.5, gap: u * 0.25 }}>
            {rts.length
              ? ([[['Average', `${Math.round(mean(rts))} ms`], ['Median', `${Math.round(median(rts))} ms`]], [['Fastest', `${Math.min(...rts)} ms`], ['Slowest', `${Math.max(...rts)} ms`]], [['Std Dev', `±${Math.round(sd(rts))} ms`]]] as const).map((pair, i) => (
                  <View key={i} style={{ flexDirection: 'row', columnGap: u * 0.75 }}>
                    {pair.map(([k, v], j) => (
                      <View key={k} style={{ flex: 1, flexDirection: 'row', columnGap: u * 0.75 }}>
                        <X s={0.72} c={C.sub} style={{ width: j ? u * 3.3 : u * 3.6 }}>{k}</X>
                        <X s={0.72} w="s" num style={{ flex: 1 }}>{v}</X>
                      </View>
                    ))}
                  </View>
                ))
              : null}
          </View>
        </Card>
      </View>
      <X s={0.66} c={C.faint} style={{ textAlign: 'center', paddingBottom: u * 0.5 }}>Every figure is computed from the stored round shown.</X>
    </>
  );

  const sessions = (() => {
    const mine = allResults.data?.items ?? [];
    const sess = (results.data?.items ?? []).slice(0, 6);
    const stat = (s: SessionDTO) => s.summary;
    const cols = { gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr' } as never;
    void cols;
    const row = (cells: (string | undefined)[], i: number, on: boolean, flex: number[]) => (
      <View key={i} style={[{ flexDirection: 'row', alignItems: 'center', gap: u * 0.5, borderRadius: u, paddingHorizontal: u * 0.5, paddingVertical: u * 0.5, overflow: 'hidden' }, !on && i % 2 ? { backgroundColor: C.tint } : null]}>
        {on ? <GradientFill /> : null}
        {cells.map((c, j) => <X key={j} s={0.85} w={j === 0 ? 'b' : 'm'} num c={on ? '#fff' : C.text} style={{ flex: flex[j] }} numberOfLines={1}>{c}</X>)}
      </View>
    );
    const head = (cells: string[], flex: number[]) => (
      <View style={{ flexDirection: 'row', gap: u * 0.5, paddingHorizontal: u * 0.5, paddingVertical: u * 0.375 }}>
        {cells.map((c, j) => <X key={j} s={0.66} w="b" up c={C.faint} style={{ flex: flex[j] }}>{c}</X>)}
      </View>
    );
    const f1 = [1.4, 1, 1, 1, 1];
    const f2 = [1.4, 0.5, 0.7, 0.7, 0.8, 0.9];
    return (
      <View style={{ gap: u * 0.75 }}>
        <Card pad={0.75} style={{ borderRadius: u * 1.6 }}>
          <View style={{ marginBottom: u * 0.5 }}><X s={0.85} w="b" up>Recent sessions · {GAMES[game].name}</X></View>
          {sess.length ? (
            <>
              {head(['Session', 'Avg RT', 'Accuracy', 'Fastest', 'Time'], f1)}
              {sess.map((s, k) => {
                const m = stat(s);
                return row([`Session ${k + 1}${k === 0 ? ' (latest)' : ''}`, m?.avg_rt != null ? `${Math.round(m.avg_rt)} ms` : '--', m ? `${Math.round(m.accuracy)}%` : '--', m?.best_rt != null ? `${Math.round(m.best_rt)} ms` : '--', m ? fmtClock(m.duration_ms / 1000) : '--'], k, k === 0, f1);
              })}
            </>
          ) : <Empty>No completed {GAMES[game].name} rounds yet.</Empty>}
        </Card>
        <Card pad={0.75} style={{ borderRadius: u * 1.6 }}>
          <View style={{ marginBottom: u * 0.5 }}><X s={0.85} w="b" up>Played rounds</X></View>
          {mine.length ? mine.map((s, i) => row([GAMES[s.game].name, `L${s.level}`, `${s.summary?.correct_hits ?? 0} hits`, `${s.summary?.misses ?? 0} miss`, `${+(s.summary?.accuracy ?? 0).toFixed(1)}%`, s.summary?.avg_rt != null ? `${Math.round(s.summary.avg_rt)} ms` : '--'], i, false, f2)) : <Empty>No rounds played yet.</Empty>}
        </Card>
      </View>
    );
  })();

  const comparison = (() => {
    const items = board.data?.items ?? [];
    if (!S) return <Empty>No {GAMES[game].name} rounds yet.</Empty>;
    const tm = (k: 'avg_rt' | 'speed' | 'accuracy' | 'cv' | 'rcs') => { const v = items.map((i) => i[k]).filter((x): x is number => x !== null); return v.length ? mean(v) : 0; };
    type Who = { id: string; label: string; me: boolean; get: (k: 'avg_rt' | 'speed' | 'accuracy' | 'cv' | 'rcs') => number };
    const mine: Who = { id: 'me', label: firstName(name), me: true, get: (k) => ({ avg_rt: S.avg, speed: S.speed, accuracy: S.acc, cv: S.cv, rcs: S.rcs })[k] };
    const others: Who[] = vs.map((id): Who | null => {
      if (id === 'team') return { id, label: 'Team', me: false, get: tm };
      const it = items.find((i) => i.id === id);
      return it ? { id, label: firstName(it.name), me: false, get: (k) => it[k] ?? 0 } : null;
    }).filter((x): x is Who => !!x);
    const M: [string, 'avg_rt' | 'speed' | 'accuracy' | 'cv' | 'rcs', string, number, boolean][] = [
      ['Reaction time', 'avg_rt', 'ms', 0, true],
      ['Speed', 'speed', 'targets/s', 2, false],
      ['Accuracy', 'accuracy', '%', 0, false],
      ['Variation', 'cv', '%', 0, true],
      ['RCS', 'rcs', '', 2, false],
    ];
    const toggle = (id: string) => setVs((cur) => (cur.includes(id) ? (cur.length > 1 ? cur.filter((x) => x !== id) : cur) : [...cur, id].slice(-3)));
    const rivals = items.filter((i) => i.id !== pid);
    return (
      <Card pad={0.75} style={{ borderRadius: u * 1.6 }}>
        <X s={0.85} w="b" up>{firstName(name)} compared with</X>
        <X s={0.72} c={C.sub} style={{ marginBottom: u * 0.5 }}>{GAMES[game].name} · latest round of each player · pick the team and up to three players</X>
        <ChipRow>
          <RoundChip on={vs.includes('team')} label="Team average" onPress={() => toggle('team')} />
          {rivals.map((r) => <RoundChip key={r.id} on={vs.includes(r.id)} label={firstName(r.name)} onPress={() => toggle(r.id)} />)}
        </ChipRow>
        <View style={{ gap: u * 0.5, marginTop: u * 0.5 }}>
          {M.map(([l, k, un, dec, low]) => {
            const mx = Math.max(mine.get(k), ...others.map((o) => o.get(k))) || 1;
            const first = others[0];
            const t = first ? first.get(k) : 0;
            const a = mine.get(k);
            const df = t ? ((a - t) / t) * 100 : 0;
            const good = low ? df <= 0 : df >= 0;
            return (
              <View key={l} style={[{ borderRadius: u * 1.25, padding: u * 0.75 }, glassLo(), neoIn(u)]}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: u * 0.375 }}>
                  <X s={0.85} w="b">{l}</X>
                  {first ? <X s={0.72} w="s" num c={good ? C.success : C.danger}>{df > 0 ? '↑' : '↓'} {Math.abs(df).toFixed(0)}% {good ? 'better' : 'behind'} {first.label}</X> : null}
                </View>
                {[mine, ...others].map((w) => {
                  const v = w.get(k);
                  return (
                    <View key={w.id} style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.5, marginBottom: u * 0.25 }}>
                      <X s={0.72} c={C.sub} style={{ width: u * 4.5 }} numberOfLines={1}>{w.label}</X>
                      <View style={{ flex: 1, height: u * 0.5, borderRadius: 999, backgroundColor: C.tint, overflow: 'hidden' }}>
                        <View style={{ width: `${(v / mx) * 100}%`, height: '100%', borderRadius: 999, overflow: 'hidden', backgroundColor: w.me ? undefined : C.faint }}>{w.me ? <GradientFill /> : null}</View>
                      </View>
                      <X s={0.72} w="b" num style={{ width: u * 6.5, textAlign: 'right' }}>{v.toFixed(dec)} {un}</X>
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      </Card>
    );
  })();

  const profile = (
    <Card pad={0.75} style={{ borderRadius: u * 1.6 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: u * 0.75, marginBottom: u * 0.75 }}>
        <Avatar name={name || '?'} size={u * 5} fs={1.1 * 15} />
        <View style={{ gap: u * 0.25 }}>
          <X s={1.25} w="b">{name}</X>
          <View style={{ flexDirection: 'row', gap: u * 0.5 }}>
            {cur ? <Pill>{cur.player_code.toUpperCase()}</Pill> : null}
            <Pill t={cur && cur.status !== 'active' ? 'off' : 'good'}>{cur && cur.status !== 'active' ? 'Inactive' : 'Active'}</Pill>
          </View>
        </View>
      </View>
      {cur ? (
        <Facts items={[['Age', cur.age ?? '--'], ['Weight', weight != null ? `${weight} kg` : '--'], ['Team', coachName ?? '--'], ['Program', cur.program_name ?? '--'], ['Stage', cur.stage ?? '--'], ['Hits', cur.perf.hits], ['Misses', cur.perf.misses], ['Accuracy', cur.perf.accuracy != null ? `${cur.perf.accuracy}%` : '--']]} />
      ) : perf.data ? (
        <Facts items={[['Rounds', perf.data.summary.sessions], ['Hits', perf.data.summary.hits], ['Misses', perf.data.summary.misses], ['Avg reaction', perf.data.summary.avg_rt != null ? `${perf.data.summary.avg_rt} ms` : '--']]} />
      ) : null}
      {!isPlayer && cur ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: u * 0.5, marginTop: u * 0.75 }}>
          <Button size="sm" variant="secondary" label="Edit in Players" onPress={() => { setSelId(cur.id); router.push('/players' as never); }} />
        </View>
      ) : null}
    </Card>
  );

  const main = (
    <View style={{ gap: u * 0.75, minWidth: 0 }}>
      {isPlayer ? null : <PlayerPick visible={pick} players={players} selId={cur?.id ?? null} onPick={setSelId} onClose={() => setPick(false)} />}
      {Header}
      {tab === 'Performance' ? performance : tab === 'Sessions' ? sessions : tab === 'Comparison' ? comparison : tab === 'Insights' ? (
        <View style={{ gap: u * 0.75 }}>
          <Card pad={0.75} style={{ borderRadius: u * 1.6 }}>
            <View style={{ marginBottom: u * 0.5 }}><X s={0.85} w="b" up>Performance Insights &amp; Improvement Plan</X></View>
            {perf.data ? <InsightsPanel bare result={perf.data.insights} /> : <LoadingBlock />}
          </Card>
          <AiSlot name={firstName(name)} />
        </View>
      ) : profile}
    </View>
  );

  if (!isPlayer && roster.isLoading) return <LoadingBlock />;

  if (tv) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', gap: u * 0.75, minHeight: 0 }}>
        {!isPlayer ? (
          <View style={{ width: u * 13.5, gap: u * 0.75, minHeight: 0 }}>
            <PlayersPanel list={list} total={players.length} sel={cur?.id ?? null} setSel={setSelId} q={q} setQ={setQ} team={team} setTeam={setTeam} teams={teams} sparks={sparks} />
            <GamesPanel gi={gi} setGi={setGi} maxH="48%" />
          </View>
        ) : null}
        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ paddingRight: u * 0.25, gap: u * 0.75 }}>
          {isPlayer ? <GamesPanel gi={gi} setGi={setGi} /> : null}
          {main}
        </ScrollView>
      </View>
    );
  }
  return (
    <View style={{ gap: u * 0.75 }}>
      {!isPlayer ? (
        <ChipRow>
          {players.map((p) => <RoundChip key={p.id} on={p.id === cur?.id} label={firstName(p.display_name)} onPress={() => setSelId(p.id)} lead={<Avatar name={p.display_name} size={u * 2.75} fs={0.85 * 15} />} />)}
        </ChipRow>
      ) : null}
      <ChipRow>
        {GAME_SLUGS.map((s, i) => <RoundChip key={s} on={i === gi} label={GAMES[s].name} onPress={() => setGi(i)} icon={<Icon name={GAME_ICON[s]} size={u * 1.1} color={i === gi ? '#fff' : C.idle} />} />)}
      </ChipRow>
      {main}
    </View>
  );
}
