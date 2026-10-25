// Coach tools for the Insights tab: weekly plan, early-warning flags, and "ask in plain words".
// Plan and flags are calculated on the server from recorded rounds (no internet needed). Ask uses Claude when the server
// has a key, and a built-in matcher for common questions otherwise.

import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { C } from '../theme/tokens';
import { useDevice } from '../theme/device';
import { api } from '../lib/api';
import { useGet } from '../lib/queries';
import { Button } from './Button';
import { Card } from './Card';
import { Pill, X } from './Bits';

interface PlanSession { day: number; game_name: string; level: number; rounds: number; why: string }
interface Plan { sessions: PlanSession[]; note: string; based_on_rounds: number }
interface PlayerFlags { player_id: string; name: string; code: string; flags: { code: string; severity: 'high' | 'medium'; text: string; action: string }[] }
interface Ask { answer: string; source: 'claude' | 'built-in'; note: string | null }

export function PlanCard({ base }: { base: string }) {
  const { u } = useDevice();
  const q = useGet<Plan>(`${base}/plan`);
  const p = q.data;
  return (
    <Card pad={0.75} style={{ borderRadius: u * 1.6 }} testID="plan-card">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: u * 0.5, marginBottom: u * 0.5 }}>
        <X s={0.85} w="b" up>This week's plan</X>
        <Pill t="off">Made from recent rounds</Pill>
      </View>
      {!p ? <X s={0.85} c={C.sub}>Working out a plan…</X> : (
        <View style={{ gap: u * 0.5 }}>
          <X s={0.8} c={C.sub}>{p.note}</X>
          {p.sessions.map((s) => (
            <View key={s.day} style={{ flexDirection: 'row', gap: u * 0.75, padding: u * 0.625, borderRadius: u, backgroundColor: C.tint }}>
              <View style={{ width: u * 3.2 }}><X s={0.8} w="b" c={C.highlight}>Day {s.day}</X></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <X s={0.9} w="s">{s.game_name} · level {s.level} · {s.rounds} rounds</X>
                <X s={0.78} c={C.sub}>{s.why}</X>
              </View>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

export function FlagsCard() {
  const { u } = useDevice();
  const q = useGet<{ items: PlayerFlags[] }>('/ai/flags');
  const items = q.data?.items ?? [];
  return (
    <Card pad={0.75} style={{ borderRadius: u * 1.6 }} testID="flags-card">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: u * 0.5, marginBottom: u * 0.5 }}>
        <X s={0.85} w="b" up>Early warnings</X>
        <Pill t={items.length ? 'warn' : 'good'}>{q.isLoading ? 'Checking' : items.length ? `${items.length} to look at` : 'All clear'}</Pill>
      </View>
      {!items.length && !q.isLoading ? <X s={0.85} c={C.sub}>Nobody is inactive, losing accuracy or slowing down.</X> : null}
      <View style={{ gap: u * 0.5 }}>
        {items.slice(0, 8).map((p) => (
          <View key={p.player_id} style={{ padding: u * 0.625, borderRadius: u, backgroundColor: C.tint, gap: u * 0.25 }}>
            <X s={0.9} w="s">{p.name} <X s={0.75} c={C.faint}>{p.code}</X></X>
            {p.flags.map((f) => (
              <View key={f.code}>
                <X s={0.82} c={f.severity === 'high' ? C.danger : C.warning}>{f.text}</X>
                <X s={0.75} c={C.sub}>{f.action}</X>
              </View>
            ))}
          </View>
        ))}
      </View>
    </Card>
  );
}

const SUGGEST = ['Who improved most?', 'Who needs attention?', 'Who has not trained this week?', 'Who is fastest?'];

export function AskCard() {
  const { u } = useDevice();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Ask | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function go(question: string) {
    if (question.trim().length < 2) return;
    setBusy(true);
    setErr(null);
    try {
      setOut(await api.post<Ask>('/ai/ask', { question: question.trim() }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not answer.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card pad={0.75} style={{ borderRadius: u * 1.6 }} testID="ask-card">
      <View style={{ marginBottom: u * 0.5 }}><X s={0.85} w="b" up>Ask about your players</X></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: u * 0.5, marginBottom: u * 0.625 }}>
        {SUGGEST.map((s) => (
          <Button key={s} size="sm" variant="secondary" label={s} onPress={() => { setText(s); go(s); }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.625 }}>
        <View style={{ flex: 1, minWidth: 0, minHeight: u * 2.5, justifyContent: 'center', paddingHorizontal: u * 0.75, borderRadius: u, backgroundColor: C.tint }}>
          <TextInput value={text} onChangeText={setText} onSubmitEditing={() => go(text)} placeholder="Ask in your own words…" placeholderTextColor={C.faint} maxLength={300} style={{ color: C.text, fontFamily: 'Manrope_500Medium', fontSize: u * 0.9, padding: 0, outlineStyle: 'none' } as never} />
        </View>
        <Button size="sm" label="Ask" loading={busy} onPress={() => go(text)} />
      </View>
      {err ? <X s={0.85} c={C.danger} style={{ marginTop: u * 0.5 }}>{err}</X> : null}
      {out ? (
        <View style={{ marginTop: u * 0.625, gap: u * 0.375 }}>
          <View style={{ padding: u * 0.75, borderRadius: u, backgroundColor: C.tint }}><X s={0.92} style={{ lineHeight: u * 1.45 }}>{out.answer}</X></View>
          <X s={0.7} c={C.faint}>{out.source === 'claude' ? 'Answered by Claude from recorded numbers.' : out.note ?? 'Built-in answer.'}</X>
        </View>
      ) : null}
    </Card>
  );
}