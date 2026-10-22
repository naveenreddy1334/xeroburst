// S07 How to play. A short training briefing: what to do, how it is scored, what counts as a miss,
// how fast it is, and how the levels work. The animated board shows the first steps in a few seconds.

import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ENDURANCE_SECONDS, GAMES, SIM_LEVELS, isGameSlug } from '@nboard/shared';
import type { GameDTO, GameSlug, HowToDTO, IconName } from '@nboard/shared';
import { Screen } from '../../../../ui/Screen';
import { Header } from '../../../../ui/Header';
import { Txt } from '../../../../ui/Txt';
import { Button } from '../../../../ui/Button';
import { Icon } from '../../../../ui/Icon';
import { ErrorBlock, LoadingBlock } from '../../../../ui/States';
import { MiniBoard } from '../../../../board/MiniBoard';
import { C, GAME_ACCENT, R, alpha, glow, onColor } from '../../../../theme/tokens';
import { useDevice } from '../../../../theme/device';
import { usePrefs } from '../../../../state/prefs';
import { useGet } from '../../../../lib/queries';
import { RequirePermission } from '../../../../ui/RequirePermission';

const s1 = (ms: number) => `${Number((ms / 1000).toFixed(2))}s`;

interface Rule {
  icon: IconName;
  title: string;
  /** **bold** marks the words to highlight */
  text: string;
}
interface Briefing {
  objective: string;
  rules: Rule[];
}

/** The numbers come from the same tables the board uses, so the briefing never drifts from the game. */
function briefing(slug: GameSlug): Briefing {
  switch (slug) {
    case 'quick': {
      const w = SIM_LEVELS.quick.window;
      return {
        objective: 'Hit each light the moment it turns on.',
        rules: [
          { icon: 'play', title: 'Controls', text: 'One button lights up. **Press it** as fast as you can. The next one follows straight away.' },
          { icon: 'check', title: 'Scoring', text: 'Each correct hit is **1 point**. Your reaction time is measured on every hit.' },
          { icon: 'close', title: 'Misses', text: 'A **miss** is a light you did not hit in time, or the wrong button. Misses lower your accuracy.' },
          { icon: 'clock', title: 'Timing', text: `**${SIM_LEVELS.quick.count} lights** per level. You get ${s1(w[0]!)} to hit each at level 1, down to ${s1(w[9]!)} at level 10.` },
          { icon: 'trendUp', title: 'Levels', text: 'Pick a level to start from. **Finish it and the next level starts by itself**, faster each time.' },
        ],
      };
    }
    case 'memory': {
      const t = SIM_LEVELS.memory.pressTimeout;
      return {
        objective: 'Watch the lights, then press them in the same order.',
        rules: [
          { icon: 'eye', title: 'Controls', text: 'Lights **flash in order**. When they stop, press the same buttons **in the same order**.' },
          { icon: 'check', title: 'Scoring', text: 'Your score is the **longest sequence** you repeat correctly.' },
          { icon: 'close', title: 'Misses', text: `A wrong button, or no press in time, is a **miss and a strike**. ${SIM_LEVELS.memory.strikes} strikes end the level.` },
          { icon: 'clock', title: 'Timing', text: `You get ${s1(t[0]!)} per step. The speed is the **same on every level**; only the sequence gets longer. The top is ${SIM_LEVELS.memory.maxLen} steps.` },
          { icon: 'trendUp', title: 'Levels', text: '**Level 1 is one light. Level 2 is the same light plus one more**, and so on. Each new run uses a new order.' },
        ],
      };
    }
    case 'hunt': {
      const w = SIM_LEVELS.hunt.window;
      return {
        objective: 'The screen names a button. Find it and press it.',
        rules: [
          { icon: 'target', title: 'Controls', text: 'The screen shows **TARGET 7**, for example. Several lights are on. **Press button 7** and ignore the rest.' },
          { icon: 'check', title: 'Scoring', text: 'Each correct press is **1 point**. Your find time is measured from when the number appears.' },
          { icon: 'close', title: 'Misses', text: 'A wrong button, a **decoy light**, a timeout, or pressing on **NO HIT** all count as misses.' },
          { icon: 'clock', title: 'Timing', text: `**${SIM_LEVELS.hunt.count} targets** per level. ${s1(w[0]!)} to find each at level 1, down to ${s1(w[9]!)} at level 10.` },
          { icon: 'trendUp', title: 'Levels', text: 'Higher levels add **more lights, decoys and NO HIT** moments. **Finish a level and the next starts by itself.**' },
        ],
      };
    }
    default: {
      return {
        objective: 'Keep your speed for the whole round.',
        rules: [
          { icon: 'flame', title: 'Controls', text: 'Targets keep coming with **no break**. Hit each lit button as it appears.' },
          { icon: 'check', title: 'Scoring', text: 'Each correct hit is **1 point**. The result shows how much you **slowed down** from start to end.' },
          { icon: 'close', title: 'Misses', text: 'A light you did not hit in time, or the wrong button, is a **miss**.' },
          { icon: 'clock', title: 'Timing', text: `Every round lasts **${ENDURANCE_SECONDS[0]} seconds**. The window shrinks as the round goes on, and the light that is on at the end gets a moment to finish.` },
          { icon: 'trendUp', title: 'Levels', text: 'Pick a level to start from. **Finish it and the next level starts by itself.**' },
        ],
      };
    }
  }
}

/** Three short lines for the top of the screen. The full rules sit under "More details". */
const SHORT: Record<GameSlug, [IconName, string][]> = {
  quick: [['play', 'Press the light that turns on'], ['clock', 'Faster hits score better'], ['trendUp', 'Each level is quicker']],
  memory: [['eye', 'Watch the lights flash'], ['play', 'Press them in the same order'], ['trendUp', 'Each level adds one step']],
  hunt: [['target', 'The screen names a button'], ['play', 'Find it and press it'], ['close', 'Ignore decoys and NO HIT']],
  endure: [['flame', 'Targets never stop'], ['play', 'Keep hitting each light'], ['clock', 'Stay fast until the end']],
};

/** **text** -> highlighted words */
function Rich({ text, color, size }: { text: string; color: string; size?: number }) {
  const parts = text.split('**');
  return (
    <Txt v="body" size={size} color={C.sub}>
      {parts.map((p, i) => (i % 2 ? <Txt key={i} v="bodyStrong" size={size} color={color}>{p}</Txt> : p))}
    </Txt>
  );
}

function RuleCard({ r, accent, tv }: { r: Rule; accent: string; tv: boolean }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: tv ? 340 : 260, backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1.5, borderColor: C.border, padding: 16, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(accent, 0.16) }}>
          <Icon name={r.icon} size={20} color={accent} />
        </View>
        <Txt v="h2" size={tv ? 26 : 20}>{r.title}</Txt>
      </View>
      <Rich text={r.text} color={C.text} size={tv ? 20 : undefined} />
    </View>
  );
}

export default function HowTo() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { tv, width, wide } = useDevice();
  const ok = isGameSlug(slug);
  const q = useGet<HowToDTO>(ok ? `/games/${slug}/howto` : null);
  const gq = useGet<GameDTO>(ok ? `/games/${slug}` : null);
  const locked = gq.data?.state === 'locked';
  const seen = usePrefs((s) => (ok ? !!s.seenHowTo[slug] : false));
  const [step, setStep] = useState(0);
  const steps = q.data?.steps ?? (ok ? GAMES[slug].howto : []);
  const last = step >= steps.length - 1;

  const [more, setMore] = useState(false);

  // The demonstration loops by itself: step through, pause on the last one, start again.
  useEffect(() => {
    if (!steps.length) return;
    const t = setTimeout(() => setStep((s) => (s >= steps.length - 1 ? 0 : s + 1)), last ? 3200 : 2400);
    return () => clearTimeout(t);
  }, [step, steps.length, last]);

  if (!ok) return <ErrorBlock error={new Error('Unknown game')} />;
  const accent = GAME_ACCENT[slug];
  const info = GAMES[slug];
  const b = briefing(slug);
  const go = () => {
    usePrefs.getState().markHowTo(slug);
    router.replace(`/nboard/${slug}/ready` as never);
  };
  const boardW = tv ? 480 : wide ? 400 : Math.min(width - 64, 320);

  return (
    <RequirePermission any={['PLAY_GAME']}>
      <Screen testID="screen-howto">
        <Header title={info.name} eyebrow="How to play" back="/nboard" />
        {q.isLoading && !steps.length ? <LoadingBlock /> : q.error && !steps.length ? <ErrorBlock error={q.error} onRetry={() => void q.refetch()} /> : (
          <>
            {/* Demonstration: the board plays the steps in a loop, one caption at a time. */}
            <View style={{ alignItems: 'center', gap: 14, backgroundColor: C.surface, borderRadius: R.xl, borderWidth: 1.5, borderColor: C.border, padding: tv ? 24 : 16 }}>
              <Txt v="h1" size={tv ? 34 : 22} align="center" testID="howto-objective">{b.objective}</Txt>
              <MiniBoard steps={steps} step={step} accent={accent} width={boardW} />
              <Txt v="bodyStrong" size={tv ? 24 : 17} align="center" style={{ minHeight: tv ? 64 : 48 }} testID="howto-caption">{steps[step]?.caption ?? ''}</Txt>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                {steps.map((_, i) => (
                  <Pressable key={i} onPress={() => setStep(i)} accessibilityRole="button" accessibilityLabel={`Step ${i + 1}`} hitSlop={10}>
                    <View style={{ width: i === step ? 26 : 9, height: 9, borderRadius: 5, backgroundColor: i === step ? accent : C.tintHi }} />
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
              {SHORT[slug].map(([ic, tx]) => (
                <View key={tx} style={{ flexGrow: 1, flexBasis: 150, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: R.lg, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}>
                  <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(accent, 0.16) }}>
                    <Icon name={ic} size={19} color={accent} />
                  </View>
                  <Txt v="bodyStrong" size={tv ? 18 : 14} style={{ flex: 1 }}>{tx}</Txt>
                </View>
              ))}
            </View>

            <Button label={more ? 'Hide details' : 'More details'} variant="ghost" size="sm" iconRight={more ? 'chevronDown' : 'chevron'} onPress={() => setMore(!more)} />
            {more ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {b.rules.map((r) => <RuleCard key={r.title} r={r} accent={accent} tv={tv} />)}
              </View>
            ) : null}

            <View style={{ gap: 10 }}>
              {locked ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: R.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface }} testID="howto-locked">
                  <Icon name="lock" size={22} color={C.lockedText} />
                  <Txt v="body" style={{ flex: 1 }}>This game is locked for you. Ask your coach to unlock it. You can read how it works here.</Txt>
                </View>
              ) : (
                <>
                  <Button label="I'm ready" icon="play" size="lg" full color={accent} variant="accent" preferredFocus onPress={go} testID="howto-ready" />
                  {seen ? <Button label="Skip" variant="ghost" onPress={go} /> : null}
                </>
              )}
              <Txt v="small" color={C.faint} align="center">{info.measures}</Txt>
            </View>
          </>
        )}
      </Screen>
    </RequirePermission>
  );
}