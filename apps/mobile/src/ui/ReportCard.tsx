// "Progress report" card for coaches: writes a short plain-language summary of a player's week or month that can be
// shared with a parent or the hub owner. Uses Claude when the server has a key, otherwise the built-in writer (no internet).

import { useState } from 'react';
import { Platform, Share, View } from 'react-native';
import { C } from '../theme/tokens';
import { useDevice } from '../theme/device';
import { api } from '../lib/api';
import { useGet } from '../lib/queries';
import { Button } from './Button';
import { Card } from './Card';
import { Pill, Seg, X } from './Bits';

interface ReportResult { text: string; source: 'claude' | 'built-in'; note: string | null; period: 'week' | 'month'; rounds: number }
interface AiStatus { claude: boolean; model: string | null }

export function ReportCard({ playerId, name }: { playerId: string; name: string }) {
  const { u } = useDevice();
  const status = useGet<AiStatus>('/ai/status');
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<ReportResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function write() {
    setBusy(true);
    setErr(null);
    setDone(null);
    try {
      setOut(await api.post<ReportResult>(`/players/${playerId}/report`, { period }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not write the report.');
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!out) return;
    const text = `${name}: progress report\n\n${out.text}`;
    try {
      if (Platform.OS === 'web') {
        await (globalThis as { navigator?: { clipboard?: { writeText(t: string): Promise<void> } } }).navigator?.clipboard?.writeText(text);
        setDone('Copied. Paste it into a message.');
      } else {
        await Share.share({ message: text });
      }
    } catch {
      setDone('Could not share from here. Select the text and copy it.');
    }
  }

  return (
    <Card pad={0.75} style={{ borderRadius: u * 1.6 }} testID="report-card">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: u * 0.5, marginBottom: u * 0.5 }}>
        <X s={0.85} w="b" up>Progress report</X>
        <Pill t={status.data?.claude ? 'good' : 'off'}>{status.data?.claude ? 'Written by Claude' : 'Built-in writer'}</Pill>
      </View>
      <X s={0.85} c={C.sub} style={{ marginBottom: u * 0.625 }}>A short summary of {name}'s training for a parent or the hub owner. It quotes only recorded numbers.</X>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: u * 0.625, marginBottom: u * 0.625 }}>
        <Seg<'week' | 'month'> items={[['week', 'Last 7 days'], ['month', 'Last 30 days']]} value={period} onChange={(p) => { setPeriod(p); setOut(null); }} />
        <Button size="sm" label={out ? 'Write again' : 'Write report'} loading={busy} onPress={write} />
      </View>
      {err ? <X s={0.85} c={C.danger}>{err}</X> : null}
      {out ? (
        <View style={{ gap: u * 0.5 }}>
          <View style={{ borderRadius: u, padding: u * 0.75, backgroundColor: C.tint }}>
            <X s={0.92} style={{ lineHeight: u * 1.45 }}>{out.text}</X>
          </View>
          {out.note ? <X s={0.7} c={C.faint}>{out.note}</X> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.625, flexWrap: 'wrap' }}>
            <Button size="sm" variant="secondary" label={Platform.OS === 'web' ? 'Copy text' : 'Share'} onPress={share} />
            {done ? <X s={0.75} c={C.sub}>{done}</X> : null}
          </View>
        </View>
      ) : null}
    </Card>
  );
}