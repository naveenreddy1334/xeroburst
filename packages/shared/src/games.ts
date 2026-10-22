// The NBoard game catalogue (section 26). LEDs are single-colour, so colour never carries game
// meaning on the board. The accents below are for the interface only.

export const GAME_SLUGS = ['quick', 'memory', 'hunt', 'endure'] as const;
export type GameSlug = (typeof GAME_SLUGS)[number];

export type GameState = 'locked' | 'unlocked' | 'completed';

export type IconName =
  | 'bolt'
  | 'brain'
  | 'bars'
  | 'cortex'
  | 'ring2'
  | 'target'
  | 'flame'
  | 'board'
  | 'lock'
  | 'check'
  | 'play'
  | 'stop'
  | 'home'
  | 'users'
  | 'list'
  | 'chart'
  | 'shield'
  | 'gear'
  | 'server'
  | 'doc'
  | 'plus'
  | 'search'
  | 'back'
  | 'chevron'
  | 'chevronDown'
  | 'close'
  | 'clock'
  | 'trophy'
  | 'wifi'
  | 'bluetooth'
  | 'qr'
  | 'hubs'
  | 'user'
  | 'logout'
  | 'refresh'
  | 'eye'
  | 'eyeOff'
  | 'trendUp'
  | 'trendDown'
  | 'more'
  | 'copy'
  | 'print'
  | 'alert'
  | 'trash'
  | 'edit'
  | 'key'
  | 'dots'
  | 'modules'
  | 'analytics'
  | 'leaderboard'
  | 'programs'
  | 'players'
  | 'coaches'
  | 'admins'
  | 'audit'
  | 'system'
  | 'settings'
  | 'results'
  | 'pulse'
  | 'bell'
  | 'gauge'
  | 'hour'
  | 'sigma'
  | 'pencil'
  | 'memory';

export interface HowToStep {
  /** Which buttons the mini board lights in this step (1 to 10). */
  lit: number[];
  /** Button the finger taps in this step, if any. */
  tap?: number;
  caption: string;
}

export interface GameInfo {
  slug: GameSlug;
  name: string;
  /** Name used in the original brief. */
  briefName: string;
  tagline: string;
  goal: string;
  measures: string;
  accent: string;
  icon: IconName;
  minLevel: number;
  maxLevel: number;
  /** Section 26.2: steps shown before every game. */
  howto: HowToStep[];
}

export const GAMES: Record<GameSlug, GameInfo> = {
  quick: {
    slug: 'quick',
    name: 'Quick Reaction',
    briefName: 'Quick Game',
    tagline: 'Pure speed',
    goal: 'Pure reaction speed. One LED lights; hit it at once.',
    measures: 'RT, average and fastest RT, misses, accuracy',
    accent: '#19E3C8',
    icon: 'bolt',
    minLevel: 1,
    maxLevel: 10,
    howto: [
      { lit: [6], caption: 'One light turns on.' },
      { lit: [6], tap: 6, caption: 'Hit that button as fast as you can.' },
      { lit: [2], caption: 'Another light follows straight away.' },
      { lit: [2], tap: 2, caption: 'Your speed is measured on every hit.' },
    ],
  },
  memory: {
    slug: 'memory',
    name: 'Memory Sequence',
    briefName: 'Memory Game',
    tagline: 'Watch, then repeat',
    goal: 'Working memory and accuracy. Watch a sequence, repeat it.',
    measures: 'Max sequence, accuracy, completion time, errors',
    accent: '#7C5CFF',
    icon: 'brain',
    minLevel: 1,
    maxLevel: 10,
    howto: [
      { lit: [1], caption: 'Watch the lights flash in order.' },
      { lit: [], caption: 'The lights go off.' },
      { lit: [], tap: 1, caption: 'Press the buttons in the same order.' },
      { lit: [1, 5], caption: 'Each level adds one more step.' },
    ],
  },
  hunt: {
    slug: 'hunt',
    name: 'Target Hunt',
    briefName: 'Reaction Game',
    tagline: 'Find the number',
    goal: 'Visual scanning and decisions. The screen names a button; find it.',
    measures: 'RT per target, find time, wrong hits, distractor hits',
    accent: '#FFB020',
    icon: 'target',
    minLevel: 1,
    maxLevel: 10,
    howto: [
      { lit: [3, 5, 7, 10], caption: 'The screen shows a number, for example TARGET 7.' },
      { lit: [3, 5, 7, 10], tap: 7, caption: 'Find and press button 7.' },
      { lit: [3, 5, 7, 10], caption: 'Ignore lights that flash on other buttons.' },
      { lit: [], caption: 'When the screen says NO HIT, wait.' },
    ],
  },
  endure: {
    slug: 'endure',
    name: 'Endurance',
    briefName: 'Game 4',
    tagline: 'Hold the pace',
    goal: 'Hold reaction speed under continuous load.',
    measures: 'Start, middle, end RT; degradation; fatigue curve',
    accent: '#FF4D6A',
    icon: 'flame',
    minLevel: 1,
    maxLevel: 10,
    howto: [
      { lit: [4], tap: 4, caption: 'Keep hitting each target as it appears.' },
      { lit: [9], tap: 9, caption: 'The round runs the full time without a break.' },
      { lit: [1], tap: 1, caption: 'Stay fast until the end.' },
      { lit: [], caption: 'The result shows how much you slowed down.' },
    ],
  },
};

export const GAME_LIST: GameInfo[] = GAME_SLUGS.map((s) => GAMES[s]);

export function isGameSlug(v: unknown): v is GameSlug {
  return typeof v === 'string' && (GAME_SLUGS as readonly string[]).includes(v);
}

/** Every Endurance round lasts 45 seconds, at every level. No new light starts after that. */
export const ENDURANCE_SECONDS = [45, 45, 45, 45, 45, 45, 45, 45, 45, 45];
/** A light that is on when the 45 seconds are up gets to finish (hit, miss or time out); the round never runs past 45 s + this. */
export const ENDURANCE_GRACE_MS = 2000;