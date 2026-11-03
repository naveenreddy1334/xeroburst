// S07 How to play. A short training briefing: what to do, how it is scored, what counts as a miss,
// how fast it is, and how the levels work. The animated board shows the first steps in a few seconds.

import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ENDURANCE_SECONDS, GAMES, SIM_LEVELS, isGameSlug } from '@nboard/shared';
import type { GameDTO, GameSlug, IconName } from '@nboard/shared';
import { Screen } from '../../../../ui/Screen';
import { Txt } from '../../../../ui/Txt';
import { Button } from '../../../../ui/Button';
import { Icon } from '../../../../ui/Icon';
import { ErrorBlock, LoadingBlock } from '../../../../ui/States';
import { WallBoard } from '../../../../board/WallBoard';
import { GradientFill } from '../../../../ui/Gradient';
import { useFocus } from '../../../../ui/useFocus';
import { C, F, R, alpha, glow } from '../../../../theme/tokens';
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

interface Step {
  title: string;
  text: string;
  /** buttons lit on the board while this step shows */
  lit: number[];
  tap?: number;
}
interface Page {
  titleA: string;
  titleB: string;
  subtitle: string;
  scoring: string;
  progression: string;
  steps: Step[];
}

/** What each game's screen says. The three steps drive the board: which buttons glow and where the finger taps. */
const PAGE: Record<GameSlug, Page> = {
  quick: {
    titleA: 'Quick', titleB: 'Reaction',
    subtitle: 'Test your reflexes by hitting the lit button as quickly as possible.',
    scoring: 'Faster hits score better.',
    progression: 'Each level is quicker and more challenging.',
    steps: [
      { title: 'Watch for the light', text: 'A button will light up randomly on the board.', lit: [7] },
      { title: 'Hit it quickly', text: 'Press the lit button as fast as you can.', lit: [7], tap: 7 },
      { title: 'Repeat & improve', text: 'Continue for the round duration and try to beat your best time.', lit: [4], tap: 4 },
    ],
  },
  memory: {
    titleA: 'Memory', titleB: 'Sequence',
    subtitle: 'Train your memory by repeating the light sequence in the right order.',
    scoring: 'Longer sequences and fewer errors score better.',
    progression: 'Each level adds one more step to remember.',
    steps: [
      { title: 'Watch the sequence', text: 'The lights flash one after another in a set order.', lit: [1] },
      { title: 'Repeat it', text: 'Press the buttons in the same order you saw.', lit: [], tap: 1 },
      { title: 'Go further', text: 'Each level adds one more step to remember.', lit: [1, 5] },
    ],
  },
  hunt: {
    titleA: 'Target', titleB: 'Hunt',
    subtitle: 'Sharpen your focus by finding the right button among the flashing lights.',
    scoring: 'Fast, correct hits score better.',
    progression: 'Higher levels add more lights, decoys and NO HIT moments.',
    steps: [
      { title: 'Read the target', text: 'The screen names a button, for example TARGET 7.', lit: [3, 5, 7, 10] },
      { title: 'Find it fast', text: 'Press that button and ignore the other lights.', lit: [3, 5, 7, 10], tap: 7 },
      { title: 'Know when to wait', text: 'When the screen says NO HIT, do not press anything.', lit: [] },
    ],
  },
  endure: {
    titleA: '', titleB: 'Endurance',
    subtitle: 'Keep your reaction speed steady under non-stop pressure.',
    scoring: 'Staying fast until the end scores better.',
    progression: 'Pick a level to start from. Finish it and the next one starts by itself.',
    steps: [
      { title: 'Keep hitting', text: 'Hit each target the moment it appears.', lit: [4], tap: 4 },
      { title: 'Do not stop', text: `The round runs ${ENDURANCE_SECONDS[0]} seconds with no break.`, lit: [9], tap: 9 },
      { title: 'Stay fast', text: 'Your result shows how much you slowed down.', lit: [1], tap: 1 },
    ],
  },
};

const STEP_ICON: IconName[] = ['eye', 'play', 'refresh'];

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
  const { tv, width, wide, u, ui } = useDevice();
  const ok = isGameSlug(slug);
  const gq = useGet<GameDTO>(ok ? `/games/${slug}` : null);
  const locked = gq.data?.state === 'locked';
  const seen = usePrefs((s) => (ok ? !!s.seenHowTo[slug] : false));
  const [step, setStep] = useState(0);
  const [more, setMore] = useState(false);
  const { focused: readyFocused, handlers: readyHandlers } = useFocus();
  const { focused: backFocused, handlers: backHandlers } = useFocus();

  // The demonstration loops by itself: one step at a time, then back to the first.
  useEffect(() => {
    const t = setTimeout(() => setStep((s) => (s + 1) % 3), 2800);
    return () => clearTimeout(t);
  }, [step]);

  if (!ok) return <ErrorBlock error={new Error('Unknown game')} />;
  const info = GAMES[slug];
  const b = briefing(slug);
  const page = PAGE[slug];
  const st = page.steps[step % page.steps.length]!;
  const go = () => {
    usePrefs.getState().markHowTo(slug);
    router.replace(`/nboard/${slug}/ready` as never);
  };

  // Everything below is drawn at the 1280 px size and scaled with the screen, so it keeps its proportions.
  const k = Math.max(0.74, Math.min(1.5, u / 18));
  const d = (n: number) => Math.round(n * k);
  const fs = (n: number) => Math.max(n * k, 12.5) / ui;
  const gold = C.primary;
  const label = (t: string, size: number, color: string, extra?: object) => (
    <Txt v="bodyStrong" size={fs(size)} color={color} style={extra}>{t}</Txt>
  );

  const titleBlock = (
    <View style={{ gap: d(14) }}>
      {label('HOW TO PLAY', 15, gold, { letterSpacing: d(5), fontFamily: F.displaySemi })}
      <View>
        {page.titleA ? <Txt v="display" size={fs(56)} color={C.text} style={{ letterSpacing: -0.8, lineHeight: Math.round(fs(56) * ui * 1.08) }} accessibilityRole="header">{page.titleA}</Txt> : null}
        <Txt v="display" size={fs(56)} color={gold} style={{ letterSpacing: -0.8, lineHeight: Math.round(fs(56) * ui * 1.08) }} accessibilityRole={page.titleA ? undefined : 'header'}>{page.titleB}</Txt>
      </View>
      <View style={{ width: d(62), height: 3, borderRadius: 2, backgroundColor: gold }} />
      <Txt v="body" size={fs(19)} color={C.sub} style={{ lineHeight: Math.round(fs(19) * ui * 1.45), maxWidth: d(300) }}>{page.subtitle}</Txt>
    </View>
  );

  const stepsBlock = (
    <View style={{ gap: d(10) }}>
      {label('Get Started', 29, gold, { fontFamily: F.displaySemi })}
      <View>
        {page.steps.map((s, i) => {
          const on = i === step % page.steps.length;
          return (
            <Pressable
              key={s.title}
              onPress={() => setStep(i)}
              accessibilityRole="button"
              accessibilityLabel={`Step ${i + 1}: ${s.title}`}
              accessibilityState={{ selected: on }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: d(16), minHeight: d(86), borderTopWidth: i ? 1 : 0, borderTopColor: C.border }}
            >
              <View style={{ width: d(54), height: d(54), borderRadius: d(16), overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: on ? alpha(gold, 0.95) : C.borderStrong, backgroundColor: C.surface2, ...(on ? glow(gold, d(14), 0.55) : {}) }}>
                {on ? <GradientFill vertical /> : null}
                <Txt v="num" size={fs(24)} color={on ? C.onPrimary : gold}>{`0${i + 1}`}</Txt>
              </View>
              <Icon name={STEP_ICON[i]!} size={d(34)} color={gold} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Txt v="h2" size={fs(19)} color={C.text} style={{ lineHeight: Math.round(fs(19) * ui * 1.3) }}>{s.title}</Txt>
                <Txt v="small" size={fs(14)} color={C.sub} style={{ lineHeight: Math.round(fs(14) * ui * 1.4) }} testID={on ? 'howto-caption' : undefined}>{s.text}</Txt>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const cell = (icon: IconName, title: string, text: string, first: boolean, testID?: string) => (
    <View key={title} style={[{ flexGrow: 1, flexBasis: wide ? 0 : undefined, flexDirection: 'row', alignItems: 'center', gap: d(14), paddingVertical: d(14), paddingHorizontal: d(20), minWidth: 0 }, !first && (wide ? { borderLeftWidth: 1, borderLeftColor: C.border } : { borderTopWidth: 1, borderTopColor: C.border })]}>
      <Icon name={icon} size={d(38)} color={gold} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt v="h2" size={fs(16)} color={gold} style={{ lineHeight: Math.round(fs(16) * ui * 1.3) }}>{title}</Txt>
        <Txt v="small" size={fs(14)} color={C.text} style={{ lineHeight: Math.round(fs(14) * ui * 1.35) }} testID={testID}>{text}</Txt>
      </View>
    </View>
  );
  const strip = (
    <View style={{ flexDirection: wide ? 'row' : 'column', borderRadius: d(28), borderWidth: 1.5, borderColor: C.borderStrong, backgroundColor: C.surface, overflow: 'hidden', ...glow(gold, d(16), 0.18) }}>
      {cell('target', 'Game Objective', b.objective, true, 'howto-objective')}
      {cell('gauge', 'Scoring', page.scoring, false)}
      {cell('trendUp', 'Progression', page.progression, false)}
    </View>
  );

  const boardW = wide ? d(330) : Math.min(width - 64, 300);
  const board = <WallBoard lit={st.lit} tap={st.tap} width={boardW} />;

  const dots = (
    <View style={{ flexDirection: 'row', gap: d(12), alignSelf: 'center', alignItems: 'center' }}>
      {page.steps.map((s, i) => {
        const on = i === step % page.steps.length;
        return (
          <Pressable key={s.title} onPress={() => setStep(i)} accessibilityRole="button" accessibilityLabel={`Step ${i + 1}`} hitSlop={12}>
            <View style={{ width: on ? d(30) : d(10), height: d(10), borderRadius: d(5), backgroundColor: on ? gold : C.tintHi, ...(on ? glow(gold, d(10), 0.8) : {}) }} />
          </Pressable>
        );
      })}
    </View>
  );

  const cta = locked ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: R.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface }} testID="howto-locked">
      <Icon name="lock" size={22} color={C.lockedText} />
      <Txt v="body" style={{ flex: 1 }}>This game is locked for you. Ask your coach to unlock it. You can read how it works here.</Txt>
    </View>
  ) : (
    <View style={{ gap: d(8), alignItems: 'center' }}>
      <View style={{ width: '100%', maxWidth: d(560), padding: d(6), borderRadius: d(44), borderWidth: 1, borderColor: C.borderStrong, backgroundColor: C.surface, ...glow(gold, d(22), 0.28) }}>
        <Pressable
          onPress={go}
          testID="howto-ready"
          hasTVPreferredFocus
          accessibilityRole="button"
          accessibilityLabel="I'm ready"
          {...readyHandlers}
          style={{ height: Math.max(48, d(62)), borderRadius: d(36), overflow: 'hidden', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: d(14), borderWidth: readyFocused ? 3 : 0, borderColor: '#FFFFFF' }}
        >
          <GradientFill vertical />
          <Icon name="play" size={d(26)} color={C.onPrimary} />
          <Txt v="h2" size={fs(26)} color={C.onPrimary} style={{ fontFamily: F.displaySemi }}>I'm ready</Txt>
        </Pressable>
      </View>
      {seen ? <Button label="Skip" variant="ghost" onPress={go} /> : null}
    </View>
  );

  const backBtn = (
    <Pressable
      onPress={() => router.navigate('/nboard' as never)}
      accessibilityRole="button"
      accessibilityLabel="Back"
      {...backHandlers}
      style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: Math.max(40, d(40)), paddingHorizontal: d(20), borderRadius: 999, borderWidth: backFocused ? 2 : 1, borderColor: backFocused ? '#FFFFFF' : C.borderStrong, backgroundColor: C.surface }}
    >
      <Icon name="back" size={d(16)} color={C.text} />
      <Txt v="bodyStrong" size={fs(15)}>Back</Txt>
    </Pressable>
  );

  return (
    <RequirePermission any={['PLAY_GAME']}>
      <Screen testID="screen-howto" maxWidth={1240}>
        <View style={{ gap: d(22), paddingTop: d(6) }}>
          {backBtn}
          {wide ? (
            <View style={{ flexDirection: 'row', gap: d(28), alignItems: 'flex-start' }}>
              <View style={{ flex: 1, minWidth: 0, gap: d(28) }}>
                <View style={{ flexDirection: 'row', gap: d(28), alignItems: 'flex-start' }}>
                  <View style={{ width: d(300), flexShrink: 0 }}>{titleBlock}</View>
                  <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: C.border }} />
                  <View style={{ flex: 1, minWidth: 0 }}>{stepsBlock}</View>
                </View>
                {strip}
                {dots}
                {cta}
              </View>
              <View style={{ width: boardW }}>{board}</View>
            </View>
          ) : (
            <View style={{ gap: d(22) }}>
              {titleBlock}
              <View style={{ alignItems: 'center' }}>{board}</View>
              {stepsBlock}
              {strip}
            </View>
          )}
          {wide ? null : dots}
          {wide ? null : cta}
          <Button label={more ? 'Hide details' : 'More details'} variant="ghost" size="sm" iconRight={more ? 'chevronDown' : 'chevron'} onPress={() => setMore(!more)} />
          {more ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {b.rules.map((r) => <RuleCard key={r.title} r={r} accent={gold} tv={tv} />)}
            </View>
          ) : null}
          <Txt v="small" color={C.faint} align="center">{info.measures}</Txt>
        </View>
      </Screen>
    </RequirePermission>
  );
}
