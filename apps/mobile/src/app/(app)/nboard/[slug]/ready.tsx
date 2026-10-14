// S08 Ready. Pick a level (up to the cap your coach set), check the board path, then start.

import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GAMES, ENDURANCE_SECONDS, fmtMetric, isGameSlug } from '@nboard/shared';
import type { BoardStatus, GameDTO, GameSlug } from '@nboard/shared';
import { Screen } from '../../../../ui/Screen';
import { Header } from '../../../../ui/Header';
import { Txt } from '../../../../ui/Txt';
import { Button } from '../../../../ui/Button';
import { Card } from '../../../../ui/Card';
import { Icon } from '../../../../ui/Icon';
import { Banner, ErrorBlock, LoadingBlock } from '../../../../ui/States';
import { C, GAME_ACCENT, R, glow, onColor } from '../../../../theme/tokens';
import { useFocus } from '../../../../ui/useFocus';
import { useGet } from '../../../../lib/queries';
import { usePrefs } from '../../../../state/prefs';
import { RequirePermission } from '../../../../ui/RequirePermission';

function LevelTile({ n, accent, selected, locked, best, slug, onPress }: { n: number; accent: string; selected: boolean; locked: boolean; best: number | null; slug: GameSlug; onPress: () => void }) {
  const { focused, handlers } = useFocus();
  return (
    <Pressable
      onPress={locked ? undefined : onPress}
      disabled={locked}
      accessibilityRole="button"
      accessibilityLabel={`Level ${n}${locked ? ', locked' : ''}${selected ? ', selected' : ''}`}
      accessibilityState={{ selected, disabled: locked }}
      testID={`level-${n}`}
      {...handlers}
      style={{
        flexGrow: 1,
        flexBasis: 84,
        minHeight: 78,
        borderRadius: R.lg,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        opacity: locked ? 0.45 : 1,
        backgroundColor: selected ? accent : C.surface2,
        borderWidth: focused ? 3 : 1.5,
        borderColor: focused ? C.text : selected ? accent : C.border,
        ...(selected ? glow(accent, 16, 0.55) : {}),
      }}
    >
      {locked ? <Icon name="lock" size={20} color={C.lockedText} /> : <Txt v="display" size={34} color={selected ? onColor(accent) : C.text} style={{ lineHeight: 36 }}>{n}</Txt>}
      <Txt v="label" size={11} color={selected ? onColor(accent) : C.sub}>{locked ? 'Locked' : best !== null ? fmtMetric(slug, best) : 'Level'}</Txt>
    </Pressable>
  );
}

const MODE_TEXT = { auto: 'Automatic', ble: 'Bluetooth', bridge: 'Laptop bridge', mock: 'Demo Mode' } as const;

export default function Ready() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const ok = isGameSlug(slug);
  const q = useGet<GameDTO>(ok ? `/games/${slug}` : null);
  const board = useGet<BoardStatus>('/board/status', undefined, { refetchInterval: 4000 });
  const mode = usePrefs((s) => s.transportMode);
  const [level, setLevel] = useState<number | null>(null);
  const g = q.data;

  useEffect(() => {
    if (g && level === null) {
      const top = g.bests.length ? Math.max(...g.bests.map((b) => b.level)) : 1;
      setLevel(Math.min(Math.max(1, top), g.level_cap));
    }
  }, [g, level]);

  if (!ok) return <ErrorBlock error={new Error('Unknown game')} />;
  const info = GAMES[slug];
  const accent = GAME_ACCENT[slug];
  const best = g?.bests.find((b) => b.level === level);
  const b = board.data;

  return (
    <RequirePermission any={['PLAY_GAME']}>
      <Screen testID="screen-ready">
        <Header title={info.name} eyebrow="Get ready" back={`/nboard/${slug}/howto`} />
        {q.isLoading ? <LoadingBlock /> : q.error ? <ErrorBlock error={q.error} onRetry={() => void q.refetch()} /> : g ? (
          <>
            <Card accent={accent}>
              <Txt v="label">Choose your starting level</Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }} testID="level-grid">
                {Array.from({ length: g.max_level }, (_, i) => i + 1).map((n) => (
                  <LevelTile key={n} n={n} accent={accent} selected={level === n} locked={n > g.level_cap} best={g.bests.find((b) => b.level === n)?.value ?? null} slug={slug} onPress={() => setLevel(n)} />
                ))}
              </View>
              <Txt v="small" style={{ marginTop: 12 }}>
                {level ? `You start at level ${level}. Finish it and level ${Math.min(level + 1, g.level_cap)} starts by itself${level < g.level_cap ? `, all the way to level ${g.level_cap}` : ''}. ` : ''}
                {g.level_cap < g.max_level ? `Your coach allows up to level ${g.level_cap}. ` : ''}
                {slug === 'endure' && level ? `Level ${level} lasts ${ENDURANCE_SECONDS[level - 1]} seconds. ` : ''}
                {best ? `Your best here: ${fmtMetric(slug, best.value)}.` : 'No round at this level yet.'}
              </Txt>
            </Card>

            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Icon name={mode === 'mock' ? 'play' : mode === 'bridge' ? 'wifi' : 'bluetooth'} color={C.highlight} size={26} />
                <View style={{ flex: 1 }}>
                  <Txt v="label">Board connection</Txt>
                  <Txt v="bodyStrong">{MODE_TEXT[mode]}</Txt>
                  <Txt v="small">
                    {mode === 'mock' ? 'A practice board on screen. Tap the buttons yourself.' : b?.busy ? `In use${b.held_by ? ` by ${b.held_by.name}` : ''}.` : b?.mode === 'none' ? 'The laptop has no board attached. Bluetooth or Demo Mode still work.' : b?.connected ? `Laptop board ready${b.mode === 'sim' ? ' (practice board)' : ''}.` : 'Checking the board…'}
                  </Txt>
                </View>
              </View>
            </Card>
            {mode === 'auto' ? <Txt v="small" color={C.faint}>Automatic tries Bluetooth first, then the laptop. Change this in Settings.</Txt> : null}
            {b?.busy ? <Banner icon="alert">{`The board is in use${b.held_by ? ` by ${b.held_by.name}` : ''}. You can wait or try again in a moment.`}</Banner> : null}

            <Button label={`Start at level ${level ?? ''}`.trim()} size="lg" full icon="play" variant="accent" color={accent} preferredFocus disabled={!level} onPress={() => router.replace(`/nboard/${slug}/play?level=${level}` as never)} testID="start-btn" />
            <Txt v="small" align="center" color={C.faint}>A 3-2-1 countdown follows. Rounds cannot be paused.</Txt>
          </>
        ) : null}
      </Screen>
    </RequirePermission>
  );
}
