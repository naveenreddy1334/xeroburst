// Leaderboard, as in the design: a game chip row, then players ranked on their latest completed round of that game.
// Score = round(accuracy x 10 - average reaction / 2 + RCS x 100), the same number the server computes for the Analytics comparison.

import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { GAMES, GAME_SLUGS } from '@nboard/shared';
import type { GameSlug, IconName } from '@nboard/shared';
import { C } from '../../theme/tokens';
import { glassSurface } from '../../theme/surfaces';
import { useDevice } from '../../theme/device';
import { useGet } from '../../lib/queries';
import { RequirePermission } from '../../ui/RequirePermission';
import { Screen } from '../../ui/Screen';
import { Header } from '../../ui/Header';
import { Avatar } from '../../ui/Avatar';
import { Icon } from '../../ui/Icon';
import { RoundChip, X } from '../../ui/Bits';
import { GradientFill } from '../../ui/Gradient';
import { Card } from '../../ui/Card';
import { LoadingBlock } from '../../ui/States';

interface BoardItem { id: string; name: string; code: string; avg_rt: number | null; accuracy: number; rcs: number | null; score: number | null }
const GAME_ICON: Record<GameSlug, IconName> = { quick: 'bolt', memory: 'memory', hunt: 'ring2', endure: 'flame' };

function Board() {
  const { u, tv } = useDevice();
  const [gi, setGi] = useState(0);
  const q = useGet<{ items: BoardItem[] }>('/analytics/board', { game: GAME_SLUGS[gi]! });
  const rows = [...(q.data?.items ?? [])].filter((x) => x.score !== null).sort((a, b) => b.score! - a.score!);
  const W = tv ? { n: u * 2.6, a: 2, b: 1, c: 1, d: 1, e: 1 } : { n: u * 2.2, a: 1, b: u * 4.5, c: u * 6 };
  const cell = (w: number, c: React.ReactNode) => <View style={{ flex: w, minWidth: 0 }}>{c}</View>;
  const fixed = (w: number, c: React.ReactNode) => <View style={{ width: w }}>{c}</View>;
  return (
    <Screen testID="screen-leaderboard" maxWidth={100000}>
      <Header
        eyebrow="Ranked on completed rounds"
        title="Leaderboard"
        right={
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexShrink: 1, flexGrow: 0 }} contentContainerStyle={{ gap: u * 0.375, padding: u * 0.375 }}>
            {GAME_SLUGS.map((s, i) => (
              <RoundChip key={s} on={i === gi} label={GAMES[s].name} onPress={() => setGi(i)} icon={<Icon name={GAME_ICON[s]} size={u * 1.1} color={i === gi ? '#fff' : C.idle} />} />
            ))}
          </ScrollView>
        }
      />
      <Card pad={0.5} style={{ borderRadius: u * 1.6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.5, paddingHorizontal: u * 0.75, paddingVertical: u * 0.5 }}>
          {fixed(W.n, <X s={0.7} w="b" up c={C.faint}>#</X>)}
          {tv ? (
            <>
              {cell(2, <X s={0.7} w="b" up c={C.faint}>Player</X>)}
              {cell(1, <X s={0.7} w="b" up c={C.faint}>Avg RT</X>)}
              {cell(1, <X s={0.7} w="b" up c={C.faint}>Accuracy</X>)}
              {cell(1, <X s={0.7} w="b" up c={C.faint}>RCS</X>)}
              {cell(1, <X s={0.7} w="b" up c={C.faint}>Score</X>)}
            </>
          ) : (
            <>
              {cell(1, <X s={0.7} w="b" up c={C.faint}>Player</X>)}
              {fixed(W.b as number, <X s={0.7} w="b" up c={C.faint}>Avg RT</X>)}
              {fixed(W.c as number, <X s={0.7} w="b" up c={C.faint}>Accuracy</X>)}
            </>
          )}
        </View>
        {q.isLoading ? <LoadingBlock label="Loading leaderboard" /> : rows.length === 0 ? (
          <View style={{ padding: u * 1.25 }}><X s={0.9} c={C.sub} style={{ textAlign: 'center' }}>Nobody ranked yet. Players appear here after their first completed round of this game.</X></View>
        ) : rows.map((p, i) => {
          const top = i === 0;
          const tc = top ? '#fff' : C.text;
          const cells = tv ? (
            <>
              {cell(2, <View style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.625 }}><Avatar name={p.name} size={u * 2.75} fs={0.85 * 15} photoKey={p.code} /><X s={0.85} w="b" c={tc} numberOfLines={1} style={{ flexShrink: 1 }}>{p.name}</X></View>)}
              {cell(1, <X s={0.85} c={tc} num>{Math.round(p.avg_rt ?? 0)} ms</X>)}
              {cell(1, <X s={0.85} c={tc} num>{Math.round(p.accuracy)}%</X>)}
              {cell(1, <X s={0.85} c={tc} num>{(p.rcs ?? 0).toFixed(2)}</X>)}
              {cell(1, <X s={0.85} w="b" c={tc} num>{p.score}</X>)}
            </>
          ) : (
            <>
              {cell(1, <View style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.625 }}><Avatar name={p.name} size={u * 2.75} fs={0.85 * 15} photoKey={p.code} /><X s={0.85} w="b" c={tc} numberOfLines={1} style={{ flexShrink: 1 }}>{p.name}</X></View>)}
              {fixed(W.b as number, <X s={0.85} c={tc} num>{Math.round(p.avg_rt ?? 0)} ms</X>)}
              {fixed(W.c as number, <X s={0.85} c={tc} num>{Math.round(p.accuracy)}%</X>)}
            </>
          );
          return (
            <View key={p.id} style={[{ flexDirection: 'row', alignItems: 'center', gap: u * 0.5, borderRadius: u * 1.25, paddingHorizontal: u * 0.75, paddingVertical: u * 0.5, overflow: 'hidden' }, top ? ({ boxShadow: `0 ${u * 0.625}px ${u * 1.6}px -${u * 0.75}px #672BFF` } as never) : i % 2 ? { backgroundColor: C.tint } : null]}>
              {top ? <GradientFill /> : null}
              {fixed(W.n, <X s={0.85} w="b" c={tc} num>{i + 1}</X>)}
              {cells}
            </View>
          );
        })}
      </Card>
      {tv ? <X s={0.75} c={C.faint} style={{ textAlign: 'center' }}>Score = accuracy and consistency up, reaction time down.</X> : null}
    </Screen>
  );
}

export default function Leaderboard() {
  return (
    <RequirePermission any={['VIEW_RESULTS']}>
      <Board />
    </RequirePermission>
  );
}
