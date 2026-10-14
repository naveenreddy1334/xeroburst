// S09 Play and S10 Result, on one route so the round's state never has to travel through a URL.
// The phases (connecting, countdown, playing, finishing, result, interrupted, busy, error) come from PlayController.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, Linking, Platform, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { GAMES, isGameSlug, fmtDuration } from '@nboard/shared';
import type { FinishResponse, GameDTO, GameSlug } from '@nboard/shared';
import { Screen } from '../../../../ui/Screen';
import { Txt } from '../../../../ui/Txt';
import { Button } from '../../../../ui/Button';
import { Dialog } from '../../../../ui/Dialog';
import { Icon } from '../../../../ui/Icon';
import { Banner, ErrorBlock, LoadingBlock } from '../../../../ui/States';
import { LevelComplete, RunSummary } from '../../../../ui/RunScreens';
import { BoardMirror } from '../../../../board/BoardMirror';
import { TargetStage } from '../../../../board/TargetStage';
import { C, GAME_ACCENT, R, alpha } from '../../../../theme/tokens';
import { useDevice } from '../../../../theme/device';
import { PlayController, usePlay } from '../../../../lib/play';
import type { PlayView } from '../../../../lib/play';
import { TRANSPORT_LABEL } from '../../../../transport';
import type { TransportKind } from '../../../../transport';
import { useRun } from '../../../../state/ui';
import { useAuth } from '../../../../state/auth';
import { useGet, useInvalidate } from '../../../../lib/queries';
import { useReducedMotion } from '../../../../ui/motion';

export default function Play() {
  const { slug, level: lv } = useLocalSearchParams<{ slug: string; level?: string }>();
  const level = Math.min(10, Math.max(1, Number(lv) || 1));
  if (!isGameSlug(slug)) return <ErrorBlock error={new Error('Unknown game')} />;
  return <PlayRoute slug={slug} level={level} />;
}

function PlayRoute({ slug, level: startLevel }: { slug: GameSlug; level: number }) {
  const [c, setC] = useState<PlayController | null>(null);
  const [run, setRun] = useState(0);
  // Automatic progression: the player picks the level to start from; every completed level starts the
  // next one by itself, up to the highest level they may play. Each level is its own stored round.
  const [cur, setCur] = useState(startLevel);
  const [done, setDone] = useState<FinishResponse[]>([]);
  const [saved, setSaved] = useState<'uploaded' | 'outbox' | null>(null);
  const [stage, setStage] = useState<'play' | 'between' | 'summary'>('play');
  const force = useRef<TransportKind | undefined>(undefined);
  // Memory: a fresh light order for every run (Play again), the same order for every level inside a run.
  const seed = useRef(Math.floor(Math.random() * 4294967296));
  const router = useRouter();
  const settings = useAuth((s) => s.settings);
  const game = useGet<GameDTO>(`/games/${slug}`);
  const maxLevel = Math.min(game.data?.max_level ?? 10, game.data?.level_cap ?? 10);
  const accent = GAME_ACCENT[slug];

  useEffect(() => {
    const ctl = new PlayController(slug, cur, seed.current);
    setC(ctl);
    void ctl.start(force.current);
    return () => {
      ctl.dispose();
      useRun.getState().set(false);
    };
  }, [slug, cur, run]);

  const leave = () => router.replace(`/nboard` as never);

  const onLevelDone = (res: FinishResponse, how: 'uploaded' | 'outbox' | null) => {
    setDone((d) => (d.some((x) => x.session.id === res.session.id) ? d : [...d, res]));
    setSaved((prev) => (prev === 'outbox' || how === 'outbox' ? 'outbox' : how));
    // A stopped round, or a memory level the player did not repeat in full, ends the run.
    const longest = (res.session.summary as { longest_seq?: number } | null)?.longest_seq;
    const failedMemory = slug === 'memory' && typeof longest === 'number' && longest < res.session.level;
    const ended = res.session.status !== 'completed' || failedMemory;
    setStage(!ended && res.session.level < maxLevel ? 'between' : 'summary');
  };

  const restart = () => {
    setDone([]);
    setSaved(null);
    setStage('play');
    seed.current = Math.floor(Math.random() * 4294967296);
    setCur(startLevel);
    setRun((r) => r + 1);
  };

  if (stage === 'between' && done.length) {
    return (
      <LevelComplete
        game={slug}
        done={done}
        next={Math.min(maxLevel, (done[done.length - 1]!.session.level ?? cur) + 1)}
        maxLevel={maxLevel}
        accent={accent}
        onNow={() => {
          setStage('play');
          setCur((l) => Math.min(maxLevel, (done[done.length - 1]!.session.level ?? l) + 1));
        }}
        onStop={() => setStage('summary')}
      />
    );
  }
  if (stage === 'summary' && done.length) {
    return (
      <RunSummary
        game={slug}
        done={done}
        accent={accent}
        startLevel={startLevel}
        saved={saved}
        onAgain={restart}
        onOther={() => router.replace('/nboard' as never)}
        onDone={() => (settings?.player_logout_after_result ? void useAuth.getState().logout() : leave())}
        doneLabel={settings?.player_logout_after_result ? 'Done and sign out' : 'Done'}
      />
    );
  }

  if (!c) return <LoadingBlock />;
  return (
    <PlayInner
      c={c}
      slug={slug}
      level={cur}
      maxLevel={maxLevel}
      again={(kind) => {
        force.current = kind;
        setRun((r) => r + 1);
      }}
      onLevelDone={onLevelDone}
      leave={leave}
    />
  );
}

function PlayInner({ c, slug, level, maxLevel, again, onLevelDone, leave }: { c: PlayController; slug: GameSlug; level: number; maxLevel: number; again: (k?: TransportKind) => void; onLevelDone: (res: FinishResponse, how: 'uploaded' | 'outbox' | null) => void; leave: () => void }) {
  const v = usePlay(c);
  const router = useRouter();
  const { tv, wide, width, height } = useDevice();
  const inv = useInvalidate();
  const [confirmStop, setConfirmStop] = useState(false);
  const live = v.phase === 'starting' || v.phase === 'countdown' || v.phase === 'playing';
  const accent = GAME_ACCENT[slug];
  const info = GAMES[slug];
  const settings = useAuth((s) => s.settings);

  useKeepAwake();
  useEffect(() => {
    useRun.getState().set(live || v.phase === 'finishing');
  }, [live, v.phase]);

  // The board cannot pause: leaving the app ends the round.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') void c.abortBackground();
    });
    return () => sub.remove();
  }, [c]);

  // Back button (Android, TV remote): ask before ending a round.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (live) {
        setConfirmStop(true);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [live]);

  useEffect(() => {
    if (v.phase === 'result') void inv('/me', '/games', '/activity', '/analytics');
  }, [v.phase, inv]);

  // A completed level hands over to the run: the next level starts by itself, or the summary shows.
  const handed = useRef<string | null>(null);
  useEffect(() => {
    const res = v.result;
    if (v.phase !== 'result' || !res) return;
    if (handed.current === res.session.id) return;
    handed.current = res.session.id;
    onLevelDone(res, v.saved);
  }, [v.phase, v.result, v.saved, onLevelDone]);

  const boardW = Math.max(240, Math.min(tv ? 640 : 520, wide ? Math.min(width * 0.5, height - 160) : width - 32));

  const done = useCallback(() => {
    if (settings?.player_logout_after_result) void useAuth.getState().logout();
    else leave();
  }, [settings, leave]);

  // ---- phases ----
  if (v.phase === 'idle' || v.phase === 'starting') {
    return (
      <Screen center maxWidth={560} testID="play-starting">
        <LoadingBlock label={v.transport ? `Connecting by ${TRANSPORT_LABEL[v.transport]}` : 'Getting ready'} />
        <Button label="Cancel" variant="ghost" onPress={leave} />
      </Screen>
    );
  }

  if (v.phase === 'countdown') {
    return (
      <Screen center scroll={false} testID="play-countdown">
        <View style={{ alignItems: 'center', gap: 8 }} accessibilityLiveRegion="assertive">
          <Txt v="label">{info.name} · Level {level}{maxLevel > level ? ` of ${maxLevel}` : ''}</Txt>
          <Txt v="display" size={tv ? 260 : 170} color={v.countdown === 0 ? C.success : accent} style={{ lineHeight: tv ? 270 : 180 }} testID="countdown">
            {v.countdown === 0 ? 'GO' : v.countdown}
          </Txt>
        </View>
      </Screen>
    );
  }

  if (v.phase === 'playing') return <Playing v={v} c={c} accent={accent} boardW={boardW} wide={wide} tv={tv} maxLevel={maxLevel} onStop={() => setConfirmStop(true)} confirm={confirmStop} setConfirm={setConfirmStop} />;

  if (v.phase === 'finishing') {
    return (
      <Screen center testID="play-finishing">
        <LoadingBlock label="Saving your round" />
      </Screen>
    );
  }

  if (v.phase === 'interrupted') {
    return (
      <Screen center maxWidth={520} testID="play-interrupted">
        <Icon name="alert" size={40} color={C.warning} />
        <Txt v="h1">Round stopped</Txt>
        <Txt v="body" color={C.sub}>{v.interruptReason ?? 'The round did not finish.'} You played {v.hitCount} {v.hitCount === 1 ? 'target' : 'targets'}.</Txt>
        <Banner icon="chart" color={C.sub}>A stopped round is saved in your history but does not count towards personal bests, streaks or targets.</Banner>
        <Button label="Save this round" icon="check" size="lg" full onPress={() => void c.finish('interrupted')} disabled={v.hitCount === 0} preferredFocus />
        <Button label="Discard" variant="secondary" full onPress={() => void c.discard().then(leave)} />
      </Screen>
    );
  }

  if (v.phase === 'busy') {
    return (
      <Screen center maxWidth={520} testID="play-busy">
        <Icon name="lock" size={40} color={C.warning} />
        <Txt v="h1">The board is in use</Txt>
        <Txt v="body" color={C.sub}>{v.busyWho ? `${v.busyWho} is playing right now.` : 'Someone else is playing right now.'} Only one round can use the board at a time.</Txt>
        <Button label="Try again" icon="refresh" size="lg" full preferredFocus onPress={() => again()} />
        <Button label="Practice in Demo Mode" variant="secondary" full onPress={() => again('mock')} />
        <Button label="Back" variant="ghost" onPress={leave} />
      </Screen>
    );
  }

  if (v.phase === 'error') return <PlayError v={v} again={again} leave={leave} />;

  // result
  const res = v.result!;
  // A completed level is shown by the run (next level / summary). Only a stopped round is shown here.
  if (res.session.status === 'completed') {
    return (
      <Screen center testID="play-finishing">
        <LoadingBlock label="Level complete" />
      </Screen>
    );
  }
  return (
    <RunSummary
      game={slug}
      done={[res]}
      accent={accent}
      startLevel={level}
      saved={v.saved}
      onAgain={() => again()}
      onOther={() => router.replace('/nboard' as never)}
      onDone={done}
      doneLabel={settings?.player_logout_after_result ? 'Done and sign out' : 'Done'}
    />
  );
}

function Metric({ label, value, color = C.text, big }: { label: string; value: string; color?: string; big: number }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: 90, backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1.5, borderColor: C.border, paddingVertical: 8, paddingHorizontal: 12, gap: 2 }}>
      <Txt v="label" size={11}>{label}</Txt>
      <Txt v="num" size={big} color={color}>{value}</Txt>
    </View>
  );
}

function Playing({ v, c, accent, boardW, wide, tv, maxLevel, onStop, confirm, setConfirm }: { v: PlayView; c: PlayController; accent: string; boardW: number; wide: boolean; tv: boolean; maxLevel: number; onStop: () => void; confirm: boolean; setConfirm: (b: boolean) => void }) {
  const info = GAMES[v.game];
  const timeText = v.totalMs ? fmtDuration(Math.max(0, v.totalMs - v.elapsedMs)) : fmtDuration(v.elapsedMs);
  const big = tv ? 44 : 30;
  const ring = tv ? 230 : wide ? 190 : Math.max(120, Math.min(160, boardW * 0.46));
  return (
    <Screen scroll={!wide} center testID="play-playing">
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 18, alignItems: wide ? 'center' : 'stretch', justifyContent: 'center', flexGrow: 1 }}>
        <View style={{ gap: 12, flex: wide ? 1 : undefined, width: wide ? undefined : '100%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Txt v="label" color={accent}>{info.name}</Txt>
            <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: R.pill, backgroundColor: alpha(accent, 0.16), borderWidth: 1, borderColor: alpha(accent, 0.5) }}>
              <Txt v="label" size={12} color={accent} testID="level-badge">Level {v.level}{maxLevel > v.level ? ` · next up ${v.level + 1}` : ' · final level'}</Txt>
            </View>
            {v.transport ? <Txt v="small">{TRANSPORT_LABEL[v.transport]}</Txt> : null}
          </View>
          <TargetStage v={v} accent={accent} ring={ring} tv={tv} />
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <Metric label={v.totalMs ? 'Time left' : 'Time'} value={timeText} big={big} />
            <Metric label={v.game === 'memory' ? 'Best sequence' : 'Hits'} value={String(v.score)} color={C.success} big={big} />
            <Metric label="Misses" value={String(v.misses)} color={v.misses ? C.danger : C.text} big={big} />
            <Metric label="Last (ms)" value={v.lastRt === null ? '--' : String(v.lastRt)} big={big} />
          </View>
          <View style={{ alignSelf: wide ? 'flex-start' : 'stretch' }}>
            <Button label="Stop" icon="stop" variant="danger" onPress={onStop} testID="stop-btn" />
          </View>
        </View>
        <View style={{ alignItems: 'center' }}>
          <BoardMirror lit={v.lit} target={v.target} decoys={v.decoys} flash={v.flash} accent={accent} interactive={v.interactive} onPress={(n) => c.press(n)} width={boardW} />
        </View>
      </View>
      <Dialog visible={confirm} title="Stop this round?" message="The board cannot pause. You can save what you played, but a stopped round does not count for personal bests." confirmLabel="Stop round" danger onConfirm={() => { setConfirm(false); c.stop(); }} onCancel={() => setConfirm(false)} />
    </Screen>
  );
}

function PlayError({ v, again, leave }: { v: PlayView; again: (k?: TransportKind) => void; leave: () => void }) {
  const e = v.error!;
  const mode = e.kind;
  const title =
    mode === 'permission-denied' ? 'Bluetooth is not allowed' :
    mode === 'bluetooth-off' ? 'Bluetooth is off' :
    mode === 'not-found' ? 'No board found' :
    mode === 'board-offline' ? 'The laptop has no board' :
    mode === 'old-firmware' ? 'The board needs an update' :
    mode === 'backgrounded' ? 'The round ended' :
    mode === 'locked' ? 'This game is locked' :
    mode === 'unreachable' ? 'Cannot reach the server' :
    mode === 'unsupported' ? 'Not available here' : 'Could not start the round';
  const help =
    mode === 'permission-denied' ? 'Allow Bluetooth for XeroBurst in your device settings, then try again.' :
    mode === 'bluetooth-off' ? 'Switch Bluetooth on, then try again.' :
    mode === 'not-found' ? 'Switch the board on and stand close to it. You can also use the laptop bridge or Demo Mode.' :
    mode === 'board-offline' ? 'Plug the board into the laptop with USB and restart the server, or use Bluetooth or Demo Mode.' : '';
  return (
    <Screen center maxWidth={540} testID="play-error">
      <Icon name={mode === 'bluetooth-off' || mode === 'permission-denied' ? 'bluetooth' : 'alert'} size={40} color={C.warning} />
      <Txt v="h1">{title}</Txt>
      <Txt v="body" color={C.sub}>{e.message}</Txt>
      {help ? <Txt v="small">{help}</Txt> : null}
      {mode !== 'locked' ? <Button label="Try again" icon="refresh" size="lg" full preferredFocus onPress={() => again()} /> : null}
      {e.blocked && Platform.OS !== 'web' ? <Button label="Open settings" icon="gear" variant="secondary" full onPress={() => void Linking.openSettings()} /> : null}
      {mode !== 'locked' && mode !== 'backgrounded' ? (
        <>
          {mode !== 'board-offline' ? <Button label="Use the laptop bridge" variant="secondary" full onPress={() => again('bridge')} /> : null}
          <Button label="Practice in Demo Mode" variant="secondary" full onPress={() => again('mock')} />
        </>
      ) : null}
      <Button label="Back" variant="ghost" onPress={leave} />
    </Screen>
  );
}

