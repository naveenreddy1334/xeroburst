// A software board. It plays the board's side of the protocol, including the rules of the four
// games, so the app works with no hardware (Demo Mode) and the laptop bridge can be tested without
// an Arduino Mega. The real firmware implements the same rules (section 26; levels are proposals
// for the hardware team to confirm).
//
// Usage: const sim = new BoardSim(); sim.onMessage(handle); sim.receive({ t: 'hello' });
// A person (or SimBot) calls sim.press(n) to press a button.

import { ENDURANCE_GRACE_MS, ENDURANCE_SECONDS } from './games';
import type { GameSlug } from './games';
import { NBOARD_BUTTONS } from './protocol';
import type { AppToBoard, BoardToApp } from './protocol';

export interface SimDeps {
  now?: () => number;
  random?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  fw?: string;
}

type Listener = (m: BoardToApp) => void;

// ---- Difficulty tables, indexed by level 1..10 (index 0..9) -----------------------------------
export const SIM_LEVELS = {
  quick: {
    count: 20,
    window: [3000, 2600, 2000, 1700, 1400, 1200, 1000, 900, 800, 650],
    gap: [900, 800, 600, 500, 450, 350, 250, 200, 150, 100],
  },
  memory: {
    // The speed is the same on every level. What grows is the length: level N shows N steps.
    on: [600, 600, 600, 600, 600, 600, 600, 600, 600, 600],
    off: [260, 260, 260, 260, 260, 260, 260, 260, 260, 260],
    pressTimeout: [5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000],
    strikes: 3,
    maxLen: 15,
  },
  hunt: {
    count: 20,
    // 10 buttons: lights in play + decoys never exceed 10 (was 4..12 with 12 buttons)
    inPlay: [4, 5, 6, 7, 8, 9, 9, 8, 8, 7],
    window: [4000, 3500, 3000, 2600, 2200, 1900, 1600, 1400, 1200, 1000],
    gap: [700, 600, 500, 450, 400, 350, 300, 250, 200, 150],
    decoys: [0, 0, 0, 0, 0, 0, 1, 2, 2, 3],
    nohit: [0, 0, 0, 0, 0.1, 0.15, 0.15, 0.15, 0.2, 0.2],
  },
  endure: {
    // window and gap are computed from the level and the elapsed fraction of the round.
  },
} as const;

/**
 * The Memory Sequence for a seed: the same seed always gives the same order, and a longer length only adds steps at the end
 * (level 1 = 7, level 2 = 7 5, level 3 = 7 5 8 ...). The Mega firmware uses the same generator, so board and Demo Mode agree.
 */
export function memorySequence(seed: number, len: number): number[] {
  let s = seed >>> 0;
  const out: number[] = [];
  let prev = 0;
  for (let i = 0; i < len; i++) {
    let n = prev;
    while (n === prev) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      n = 1 + ((s >>> 16) % NBOARD_BUTTONS);
    }
    out.push(n);
    prev = n;
  }
  return out;
}

interface Step {
  kind: 'go' | 'nohit';
  n: number;
  field?: number[];
  decoys?: number[];
  window: number;
  gap: number;
}

interface Round {
  press(n: number): void;
  stop(): void;
}

export class BoardSim {
  private listeners = new Set<Listener>();
  private timers = new Set<unknown>();
  private round: Round | null = null;
  private game: GameSlug | null = null;
  private level = 1;
  private seed = 1;
  private t0 = 0;
  private disposed = false;

  private readonly now: () => number;
  private readonly random: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (h: unknown) => void;
  private readonly fw: string;

  constructor(deps: SimDeps = {}) {
    this.now = deps.now ?? (() => Date.now());
    this.random = deps.random ?? Math.random;
    this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.fw = deps.fw ?? '1.1-sim';
  }

  get running(): boolean {
    return this.round !== null;
  }

  onMessage(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** The app sends a command to the board. */
  receive(msg: AppToBoard): void {
    if (this.disposed) return;
    switch (msg.t) {
      case 'hello':
        this.emit({ t: 'hello', fw: this.fw, btn: NBOARD_BUTTONS });
        return;
      case 'cfg':
        if (this.round) return this.emit({ t: 'err', code: 4 });
        if (!['quick', 'memory', 'hunt', 'endure'].includes(msg.g)) return this.emit({ t: 'err', code: 2 });
        if (!(msg.lv >= 1 && msg.lv <= 10)) return this.emit({ t: 'err', code: 3 });
        this.game = msg.g;
        this.level = Math.round(msg.lv);
        this.seed = typeof msg.sd === 'number' ? msg.sd : Math.floor(this.random() * 4294967296);
        this.emit({ t: 'ack', of: 'cfg' });
        return;
      case 'go':
        if (this.round) return this.emit({ t: 'err', code: 4 });
        if (!this.game) return this.emit({ t: 'err', code: 1 });
        this.emit({ t: 'ack', of: 'go' });
        this.t0 = this.now();
        this.round = this.makeRound(this.game, this.level);
        return;
      case 'stop':
        this.stopRound();
        this.emit({ t: 'ack', of: 'stop' });
        return;
      case 'hb':
        return;
    }
  }

  /** A physical button press (1 to 10). */
  press(n: number): void {
    if (this.disposed || !this.round) return;
    this.round.press(n);
  }

  dispose(): void {
    this.stopRound();
    this.disposed = true;
    this.listeners.clear();
  }

  // ---- internals -------------------------------------------------------------------------------
  private emit(m: BoardToApp) {
    for (const l of [...this.listeners]) l(m);
  }
  private t(): number {
    return this.now() - this.t0;
  }
  private after(ms: number, fn: () => void): unknown {
    const h = this.setTimer(() => {
      this.timers.delete(h);
      if (!this.disposed) fn();
    }, Math.max(0, ms));
    this.timers.add(h);
    return h;
  }
  private cancel(h: unknown) {
    if (h === undefined || h === null) return;
    this.clearTimer(h);
    this.timers.delete(h);
  }
  private stopRound() {
    if (this.round) this.round.stop();
    for (const h of this.timers) this.clearTimer(h);
    this.timers.clear();
    this.round = null;
  }
  private finish(score: number) {
    const ms = this.t();
    this.stopRound();
    this.emit({ t: 'end', score, ms });
  }
  private rnd(n: number): number {
    return Math.floor(this.random() * n);
  }
  private pick(exclude: number): number {
    let n = exclude;
    while (n === exclude) n = 1 + this.rnd(NBOARD_BUTTONS);
    return n;
  }
  private sample(count: number, include?: number): number[] {
    const pool = Array.from({ length: NBOARD_BUTTONS }, (_, i) => i + 1).filter((b) => b !== include);
    const out: number[] = include ? [include] : [];
    while (out.length < count && pool.length) out.push(pool.splice(this.rnd(pool.length), 1)[0]!);
    return out.sort((a, b) => a - b);
  }

  private makeRound(game: GameSlug, lv: number): Round {
    switch (game) {
      case 'memory':
        return this.memoryRound(lv);
      case 'hunt':
        return this.targetRound((i) => this.huntStep(i, lv), 'hunt');
      case 'endure':
        return this.targetRound((i, elapsed) => this.endureStep(i, elapsed, lv), 'endure', ENDURANCE_SECONDS[lv - 1]! * 1000);
      default:
        return this.targetRound((i) => this.quickStep(i, lv), 'quick');
    }
  }

  // ---- step planners for the target-based games --------------------------------------------------
  private lastN = 0;
  private quickStep(i: number, lv: number): Step | null {
    const c = SIM_LEVELS.quick;
    if (i >= c.count) return null;
    const n = (this.lastN = this.pick(this.lastN));
    return { kind: 'go', n, window: c.window[lv - 1]!, gap: c.gap[lv - 1]! };
  }
  private huntStep(i: number, lv: number): Step | null {
    const c = SIM_LEVELS.hunt;
    if (i >= c.count) return null;
    const gap = c.gap[lv - 1]!;
    if (this.random() < c.nohit[lv - 1]!) return { kind: 'nohit', n: 0, window: 1500, gap };
    const target = this.pick(this.lastN);
    this.lastN = target;
    const field = this.sample(c.inPlay[lv - 1]!, target);
    const free = Array.from({ length: NBOARD_BUTTONS }, (_, k) => k + 1).filter((b) => !field.includes(b));
    const decoys: number[] = [];
    for (let k = 0; k < c.decoys[lv - 1]! && free.length; k++) decoys.push(free.splice(this.rnd(free.length), 1)[0]!);
    return { kind: 'go', n: target, field, decoys, window: c.window[lv - 1]!, gap };
  }
  private endureStep(_i: number, elapsed: number, lv: number): Step | null {
    const total = ENDURANCE_SECONDS[lv - 1]! * 1000;
    if (elapsed >= total) return null;
    const p = elapsed / total;
    const w0 = 2000 - 120 * lv;
    const g0 = 600 - 40 * lv;
    const n = (this.lastN = this.pick(this.lastN));
    return { kind: 'go', n, window: Math.round(w0 * (1 - 0.4 * p)), gap: Math.round(g0 * (1 - 0.5 * p)) };
  }

  /** Generic engine: light a target, wait for the right press or a timeout, wait a gap, repeat. */
  private targetRound(plan: (i: number, elapsed: number) => Step | null, game: GameSlug, hardStopMs?: number): Round {
    let i = 0;
    let correct = 0;
    let active: { step: Step; litAt: number; timer: unknown } | null = null;
    this.lastN = 0;

    const next = () => {
      const step = plan(i, this.t());
      if (!step) return this.finish(correct);
      i++;
      const litAt = this.now();
      if (step.kind === 'nohit') {
        this.emit({ t: 'tgt', n: 0, ms: this.t(), k: 'nohit', w: step.window });
        active = { step, litAt, timer: this.after(step.window, () => { active = null; this.after(step.gap, next); }) };
        return;
      }
      const m: BoardToApp = { t: 'tgt', n: step.n, ms: this.t(), k: 'go', w: step.window };
      if (step.field) m.f = step.field;
      if (step.decoys && step.decoys.length) m.d = step.decoys;
      this.emit(m);
      active = {
        step,
        litAt,
        timer: this.after(step.window, () => {
          active = null;
          this.emit({ t: 'miss', n: step.n, ms: this.t() });
          this.after(step.gap, next);
        }),
      };
    };

    // Endurance: no new light after the time is up, the light that is on finishes, and the round never runs past the grace time.
    if (hardStopMs) this.after(hardStopMs + (game === 'endure' ? ENDURANCE_GRACE_MS : 0), () => this.finish(correct));
    this.after(game === 'endure' ? 800 : 600, next);

    return {
      press: (n: number) => {
        const a = active;
        if (!a) return;
        const rt = Math.max(0, this.now() - a.litAt);
        if (a.step.kind === 'nohit') {
          this.emit({ t: 'hit', n, ok: 0, rt, tb: 0, ms: this.t(), d: 1 });
          return;
        }
        if (n === a.step.n) {
          this.cancel(a.timer);
          active = null;
          correct++;
          this.emit({ t: 'hit', n, ok: 1, rt, tb: a.step.n, ms: this.t() });
          this.after(a.step.gap, next);
        } else if (a.step.decoys?.includes(n)) {
          this.emit({ t: 'hit', n, ok: 0, rt, tb: a.step.n, ms: this.t(), d: 1 });
        } else {
          this.emit({ t: 'hit', n, ok: 0, rt, tb: a.step.n, ms: this.t() });
        }
      },
      stop: () => {
        if (active) this.cancel(active.timer);
        active = null;
      },
    };
  }

  /** Memory Sequence: level N shows the first N steps of the run's sequence. Repeat it to finish; three strikes end the round. */
  private memoryRound(lv: number): Round {
    const c = SIM_LEVELS.memory;
    const seq: number[] = memorySequence(this.seed, lv);
    let strikes = 0;
    let longest = 0;
    let phase: 'watch' | 'repeat' | 'idle' = 'idle';
    let idx = 0;
    let promptAt = 0;
    let timeout: unknown;

    const armTimeout = () => {
      this.cancel(timeout);
      timeout = this.after(c.pressTimeout[lv - 1]!, () => {
        if (phase !== 'repeat') return;
        this.emit({ t: 'miss', n: seq[idx]!, ms: this.t(), len: seq.length, st: idx });
        strike();
      });
    };

    const show = () => {
      phase = 'watch';
      this.emit({ t: 'ph', p: 'watch', len: seq.length, ms: this.t() });
      const step = c.on[lv - 1]! + c.off[lv - 1]!;
      seq.forEach((n, k) => {
        this.after(500 + k * step, () => this.emit({ t: 'tgt', n, ms: this.t(), k: 'show', w: c.on[lv - 1]! }));
      });
      this.after(500 + seq.length * step + 200, () => {
        phase = 'repeat';
        idx = 0;
        promptAt = this.now();
        this.emit({ t: 'ph', p: 'repeat', len: seq.length, ms: this.t() });
        armTimeout();
      });
    };

    const strike = () => {
      strikes++;
      phase = 'idle';
      this.cancel(timeout);
      if (strikes >= c.strikes) return this.finish(longest);
      this.after(1200, show);
    };

    this.after(600, show);

    return {
      press: (n: number) => {
        if (phase !== 'repeat') return;
        const expected = seq[idx]!;
        const rt = Math.max(0, this.now() - promptAt);
        const ok = n === expected;
        this.emit({ t: 'hit', n, ok: ok ? 1 : 0, rt, tb: expected, ms: this.t(), len: seq.length, st: idx });
        if (!ok) return strike();
        idx++;
        promptAt = this.now();
        if (idx >= seq.length) {
          phase = 'idle';
          this.cancel(timeout);
          longest = seq.length;
          return this.finish(longest);
        } else {
          armTimeout();
        }
      },
      stop: () => {
        phase = 'idle';
        this.cancel(timeout);
      },
    };
  }
}

// ---- A simulated player ---------------------------------------------------------------------------

export interface BotOptions {
  /** 0 (slow, careless) to 1 (fast, precise). Default 0.6. */
  skill?: number;
  random?: () => number;
}

/** Presses buttons for you. Used for Demo Mode's bot, demo data and server-side tests. */
export class SimBot {
  private off: (() => void) | null = null;
  private skill: number;
  private random: () => number;
  private shown: number[] = [];
  private elapsed = 0;
  private roundMs = 0;
  private level = 1;
  private game: GameSlug | null = null;

  constructor(private sim: BoardSim, opts: BotOptions = {}, private setTimer: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms)) {
    this.skill = Math.min(1, Math.max(0, opts.skill ?? 0.6));
    this.random = opts.random ?? Math.random;
  }

  /** Call before sending cfg so the bot knows the game and level. */
  attach(): void {
    this.detach();
    this.off = this.sim.onMessage((m) => this.observe(m));
  }
  detach(): void {
    this.off?.();
    this.off = null;
  }
  /** Tell the bot which game is running (the sim does not echo cfg back). */
  configure(game: GameSlug, level: number) {
    this.game = game;
    this.level = level;
    this.shown = [];
    this.roundMs = game === 'endure' ? ENDURANCE_SECONDS[level - 1]! * 1000 : 0;
  }

  private noise(): number {
    // Roughly normal, from three uniforms.
    return (this.random() + this.random() + this.random()) / 3 - 0.5;
  }
  private rtMs(): number {
    const base = 560 - 260 * this.skill;
    const fatigue = this.game === 'endure' && this.roundMs ? (this.elapsed / this.roundMs) * 140 * (1.2 - this.skill) : 0;
    const find = this.game === 'hunt' ? 260 - 120 * this.skill : 0;
    return Math.max(160, base + find + fatigue + this.noise() * 200);
  }
  private errorRate(): number {
    return (1 - this.skill) * 0.12 + 0.01;
  }
  private wrong(n: number): number {
    let w = n;
    while (w === n) w = 1 + Math.floor(this.random() * NBOARD_BUTTONS);
    return w;
  }

  private observe(m: BoardToApp) {
    switch (m.t) {
      case 'tgt':
        this.elapsed = m.ms;
        if (m.k === 'show') {
          this.shown.push(m.n);
        } else if (m.k !== 'nohit') {
          const delay = this.rtMs();
          if (m.w && delay > m.w * 0.92) return;
          const err = this.random() < this.errorRate();
          const press = err ? this.wrong(m.n) : m.n;
          this.setTimer(() => this.sim.press(press), delay);
        }
        return;
      case 'ph':
        if (m.p === 'watch') {
          this.shown = [];
        } else {
          const seq = [...this.shown];
          let at = 350;
          seq.forEach((n) => {
            at += 300 + this.rtMs() * 0.6;
            const err = this.random() < this.errorRate() * 0.4;
            this.setTimer(() => this.sim.press(err ? this.wrong(n) : n), at);
          });
        }
        return;
      case 'end':
        this.detach();
        return;
      default:
        return;
    }
  }
}

// ---- Fast offline simulation ----------------------------------------------------------------------

/** Deterministic random numbers (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A clock you advance by hand: lets a whole round run in a few milliseconds. */
export class VirtualClock {
  t = 0;
  private q: { at: number; id: number; fn: () => void }[] = [];
  private nextId = 0;
  now = () => this.t;
  setTimer = (fn: () => void, ms: number): unknown => {
    const id = ++this.nextId;
    this.q.push({ at: this.t + Math.max(0, ms), id, fn });
    return id;
  };
  clearTimer = (h: unknown): void => {
    this.q = this.q.filter((x) => x.id !== h);
  };
  runUntil(limitMs: number, stop?: () => boolean): void {
    while (this.q.length) {
      this.q.sort((a, b) => a.at - b.at || a.id - b.id);
      const next = this.q[0]!;
      if (next.at > limitMs) break;
      this.q.shift();
      this.t = next.at;
      next.fn();
      if (stop?.()) break;
    }
  }
}

export interface SimulatedRound {
  log: BoardToApp[];
  duration_ms: number;
  ended: boolean;
  score: number;
}

/** Plays one full round with a simulated player, instantly. */
export function simulateRound(
  game: GameSlug,
  level: number,
  opts: { skill?: number; seed?: number } = {},
): SimulatedRound {
  const clock = new VirtualClock();
  const random = seededRandom(opts.seed ?? 1);
  const sim = new BoardSim({ now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, random });
  const bot = new SimBot(sim, { skill: opts.skill ?? 0.6, random }, clock.setTimer);
  const log: BoardToApp[] = [];
  let end: Extract<BoardToApp, { t: 'end' }> | null = null;
  sim.onMessage((m) => {
    log.push(m);
    if (m.t === 'end') end = m;
  });
  bot.attach();
  bot.configure(game, level);
  sim.receive({ t: 'hello' });
  sim.receive({ t: 'cfg', g: game, lv: level, sd: opts.seed ?? 1 });
  sim.receive({ t: 'go' });
  clock.runUntil(15 * 60 * 1000, () => end !== null);
  sim.dispose();
  const e = end as Extract<BoardToApp, { t: 'end' }> | null;
  return { log, duration_ms: e?.ms ?? clock.t, ended: e !== null, score: e?.score ?? 0 };
}