// "Performance Insights & Improvement Plan": two to four rule-based recommendation cards.
// Measured facts (observation, evidence) are visually separated from suggestions (action, goal), so a
// suggestion is never read as a measurement. It is training guidance, not a diagnosis.

import { View } from 'react-native';
import { GAMES } from '@nboard/shared';
import type { Insight, InsightsResult } from '@nboard/shared';
import { C } from '../theme/tokens';
import { glassLo } from '../theme/surfaces';
import { useDevice } from '../theme/device';
import { Pill, X } from './Bits';
import { useGet } from '../lib/queries';
import { Txt } from './Txt';
import { EmptyBlock, LoadingBlock } from './States';

export const INSIGHTS_TITLE = 'Performance Insights & Improvement Plan';

const DOT = { focus: '#f0c36a', improving: '#5fe0b4', strength: '#5fe0b4', start: '#5594ff' } as const;

/** One recommendation, as drawn in the design: a dot and title, what the data shows, the metric, then what to practise and the target. */
function InsightCard({ i }: { i: Insight }) {
  const { u } = useDevice();
  return (
    <View testID={`insight-${i.id}`} style={[{ borderRadius: u * 1.25, padding: u * 0.875, gap: u * 0.25 }, glassLo()]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.5 }}>
        <View style={{ width: u * 0.5, height: u * 0.5, borderRadius: 999, backgroundColor: DOT[i.kind] }} />
        <X s={0.9} w="b" style={{ flex: 1 }}>{i.title}</X>
        {i.game ? <Pill>{GAMES[i.game].name}</Pill> : null}
      </View>
      <X s={0.9} c={C.sub}>{i.observation}</X>
      <X s={0.9 * 0.82} c="rgba(53,199,255,.9)">Metric: {i.evidence}</X>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: u * 0.5, rowGap: u * 0.25 }}>
        <X s={0.9}>Practise: {i.action}</X>
        {i.goal ? (
          <View style={{ borderRadius: u * 0.5, paddingHorizontal: u * 0.5, paddingVertical: u * 0.125, backgroundColor: 'rgba(53,199,255,.1)' }}>
            <X s={0.9 * 0.82} w="b" c={C.cyan}>Target: {i.goal}</X>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** The panel itself, for a result the caller already has. */
export function InsightsPanel({ result, empty = 'Play a few rounds and your plan appears here.', bare }: { result: InsightsResult; empty?: string; bare?: boolean }) {
  const { u } = useDevice();
  return (
    <View style={{ gap: u * 0.625 }} testID="insights-panel">
      {bare ? null : <X s={0.85} w="b" up>Performance Insights &amp; Improvement Plan</X>}
      {result.items.length === 0 ? (
        <EmptyBlock icon="chart" title="No recommendations yet" message={empty} />
      ) : (
        <View style={{ gap: u * 0.625 }}>
          {result.items.map((i) => <InsightCard key={i.id} i={i} />)}
        </View>
      )}
      {result.note ? <Txt v="small" color={C.faint}>{result.note}</Txt> : null}
    </View>
  );
}

/** Insights for one finished round, from the server (the same figures the stats and reports use). */
export function SessionInsights({ sessionId }: { sessionId: string }) {
  const q = useGet<InsightsResult>(`/sessions/${sessionId}/insights`);
  if (q.isLoading) return <LoadingBlock label="Preparing your plan" />;
  if (q.isError || !q.data) {
    return (
      <View style={{ gap: 8 }} testID="insights-pending">
        <Txt v="h2">{INSIGHTS_TITLE}</Txt>
        <Txt v="small" color={C.sub}>Your plan appears once this round has been saved to the server.</Txt>
      </View>
    );
  }
  return <InsightsPanel result={q.data} />;
}
