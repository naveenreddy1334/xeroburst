// The round, from "Start" to the result (spec section 27):
//   STARTING = create the session on the server, connect the board, send cfg, wait for ack
//   COUNTDOWN -> PLAYING -> FINISHING (upload the hits; on failure keep them in the outbox)
//   BOARD_BUSY / ERROR / INTERRUPTED (save the partial round or discard it)

import { useSyncExternalStore } from 'react';
import {
  ENDURANCE_SECONDS,
  MIN_FIRMWARE,
  RowCollector,
  compareVersions,
  isBetter,
  primaryValue,
  summarize,
  tally,
  PRIMARY_METRIC,
} from '@nboard/shared';
import type { BoardStatus, BoardToApp, CreateSessionResponse, FinishResponse, GameDTO, GameSlug, HitRow } from '@nboard/shared';
import { api, ApiClientError } from './api';
import { addToOutbox } from './outbox';
import { cue } from './feedback';
import { chooseTransport, createTransport, TransportError } from '../transport';
import type { BoardTransport, TransportKind } from '../transport';
import { usePrefs } from '../state/prefs';
import { useServer } from '../state/server';
import { useAuth } from '../state/auth';
import { getModule } from './module';

export type Phase = 'idle' | 'starting' | 'countdown' | 'playing' | 'finishing' | 'result' | 'interrupted' | 'busy' | 'error';

export type FailureKind =
  | 'permission-denied'
  | 'bluetooth-off'
  | 'not-found'
  | 'board-offline'
  | 'unreachable'
  | 'timeout'
  | 'unsupported'
  | 'locked'
  | 'old-firmware'
  | 'backgrounded'
  | 'board-error'
  | 'server'
  | 'failed';

export interface PlayError {
  kind: FailureKind;
  message: string;
  /** Bluetooth permission was refused for good: open settings */
  blocked?: boolean;
}

export interface PlayView {
  phase: Phase;
  game: GameSlug;
  level: number;
  transport: TransportKind | null;
  countdown: number | null;
  lit: number[];
  target: number | null;
  decoys: number[];
  hint: 'go' | 'watch' | 'repeat' | 'nohit' | null;
  seqLen: number | null;
  step: number;
  score: number;
  correct: number;
  wrong: number;
  misses: number;
  lastRt: number | null;
  avgRt: number | null;
  elapsedMs: number;
  totalMs: number | null;
  flash: { n: number; ok: boolean } | null;
  error: PlayError | null;
  busyWho: string | null;
  interruptReason: string | null;
  result: FinishResponse | null;
  saved: 'uploaded' | 'outbox' | null;
  sessionId: string | null;
  fw: string | null;
  hitCount: number;
  /** Demo Mode: the board mirror can be tapped */
  interactive: boolean;
}

const rid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class PlayController {
  private view: PlayView;
  private listeners = new Set<() => void>();
  private transport: TransportBoard | null = null;
  private collector = new RowCollector(() => this.elapsed());
  private session: CreateSessionResponse | null = null;
  private goAt = 0;
  private startedIso = '';
  private tick: ReturnType<typeof setInterval> | null = null;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private offTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private ackWaiters: { of: 'cfg' | 'go' | 'stop'; resolve: () => void; reject: (e: Error) => void }[] = [];
  private runId = 0;
  /** counts target messages, so a delayed clear never wipes a newer target */
  private tgtSeq = 0;

  constructor(
    readonly game: GameSlug,
    readonly level: number,
    /** Memory: the order of the lights. One seed per run, so level 2 repeats level 1's lights and adds one. */
    readonly seed: number = Math.floor(Math.random() * 4294967296),
  ) {
    this.view = {
      phase: 'idle',
      game,
      level,
      transport: null,
      countdown: null,
      lit: [],
      target: null,
      decoys: [],
      hint: null,
      seqLen: null,
      step: 0,
      score: 0,
      correct: 0,
      wrong: 0,
      misses: 0,
      lastRt: null,
      avgRt: null,
      elapsedMs: 0,
      totalMs: game === 'endure' ? ENDURANCE_SECONDS[level - 1]! * 1000 : null,
      flash: null,
      error: null,
      busyWho: null,
      interruptReason: null,
      result: null,
      saved: null,
      sessionId: null,
      fw: null,
      hitCount: 0,
      interactive: false,
    };
  }

  // ---- external store -------------------------------------------------------------------------------
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.view;
  private set(patch: Partial<PlayView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    this.listeners.forEach((l) => l());
  }
  private elapsed() {
    return this.goAt ? Date.now() - this.goAt : 0;
  }

  // ---- start ------------------------------------------------------------------------------------------
  async start(forceKind?: TransportKind): Promise<void> {
    const run = ++this.runId;
    this.reset();
    this.set({ phase: 'starting' });
    const abortIfStale = () => {
      if (this.disposed || run !== this.runId) throw new Cancelled();
    };
    try {
      // 1 and 2. The game lookup and the board status do not depend on each other, so ask for both at once.
      const mode = forceKind ?? usePrefs.getState().transportMode;
      const gameReq = api.get<GameDTO>(`/games/${this.game}`);
      const boardReq = api.get<BoardStatus>('/board/status').catch(() => null);
      let game: GameDTO;
      try {
        game = await gameReq;
      } catch (e) {
        if (e instanceof ApiClientError && e.code === 'GAME_LOCKED') {
          return this.fail({ kind: 'locked', message: 'This game is locked for you now. Ask your coach.' });
        }
        throw e;
      }
      abortIfStale();
      if (this.level > game.level_cap) return this.fail({ kind: 'locked', message: `Your coach allows up to level ${game.level_cap}.` });
      const board: BoardStatus | null = await boardReq;
      abortIfStale();
      const choice = await chooseTransport(mode, board);
      abortIfStale();

      // 3. The session exists on the server before anything is sent to the board.
      const id = rid();
      try {
        this.session = await api.post<CreateSessionResponse>('/sessions', { id, game: this.game, level: this.level, transport: choice.kind, module_key: useAuth.getState().user?.role === 'PLAYER' ? 'nboard' : getModule()});
      } catch (e) {
        if (e instanceof ApiClientError && e.code === 'BOARD_BUSY') {
          const who = (e.details?.held_by as string | null | undefined) ?? null;
          this.set({ phase: 'busy', busyWho: who });
          return;
        }
        if (e instanceof ApiClientError && e.code === 'GAME_LOCKED') {
          return this.fail({ kind: 'locked', message: 'This game is locked for you now. Ask your coach.' });
        }
        throw e;
      }
      abortIfStale();
      this.set({ sessionId: id, transport: choice.kind, interactive: choice.kind === 'mock' });

      // 4. Connect and configure.
      const t = createTransport(choice, { serverUrl: useServer.getState().url ?? '', ticket: this.session.board_ticket }) as TransportBoard;
      this.transport = t;
      t.onMessage((m) => this.onMessage(m));
      t.onClose((reason) => this.onClosed(reason));
      const hello = await t.connect();
      abortIfStale();
      if (hello.fw && compareVersions(hello.fw, MIN_FIRMWARE) < 0) {
        t.close();
        return this.fail({ kind: 'old-firmware', message: `The board firmware (${hello.fw}) is older than ${MIN_FIRMWARE}. Ask for an update.` });
      }
      this.set({ fw: hello.fw });
      // Register the wait first: a local board (Demo Mode) answers synchronously.
      const cfgAck = this.waitAck('cfg', 4000);
      t.send(this.game === 'memory' ? { t: 'cfg', g: this.game, lv: this.level, sd: this.seed } : { t: 'cfg', g: this.game, lv: this.level });
      await cfgAck;
      abortIfStale();
      usePrefs.setState({ lastTransport: choice.kind });

      // 5. Countdown, then go.
      this.set({ phase: 'countdown', countdown: 3 });
      for (const n of [3, 2, 1]) {
        this.set({ countdown: n });
        cue('tick');
        await wait(900);
        abortIfStale();
      }
      this.set({ countdown: 0 });
      cue('go');
      this.startedIso = new Date().toISOString();
      this.goAt = Date.now();
      const goAck = this.waitAck('go', 4000);
      t.send({ t: 'go' });
      await goAck;
      abortIfStale();
      this.set({ phase: 'playing', countdown: null, hint: this.game === 'memory' ? 'watch' : null });
      this.tick = setInterval(() => this.set({ elapsedMs: this.elapsed() }), 100);
    } catch (e) {
      if (e instanceof Cancelled) return;
      this.transport?.close();
      this.transport = null;
      if (e instanceof TransportError) {
        if (e.reason === 'board-busy') {
          this.set({ phase: 'busy', busyWho: null });
          return;
        }
        return this.fail({ kind: e.reason === 'failed' ? 'failed' : (e.reason as FailureKind), message: e.message, blocked: !!e.details?.blocked });
      }
      if (e instanceof ApiClientError) {
        return this.fail({ kind: e.code === 'NETWORK' ? 'unreachable' : 'server', message: e.message });
      }
      this.fail({ kind: 'failed', message: e instanceof Error ? e.message : 'Could not start the round.' });
    }
  }

  private waitAck(of: 'cfg' | 'go', ms: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.ackWaiters = this.ackWaiters.filter((w) => w.resolve !== done);
        reject(new TransportError('timeout', 'The board did not answer. Check it is switched on.'));
      }, ms);
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      this.ackWaiters.push({
        of,
        resolve: done,
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
    });
  }

  private fail(error: PlayError) {
    this.stopTimers();
    this.set({ phase: 'error', error });
  }

  // ---- board messages -----------------------------------------------------------------------------------
  private onMessage(m: BoardToApp) {
    switch (m.t) {
      case 'ack': {
        const w = this.ackWaiters.find((x) => x.of === m.of);
        if (w) {
          this.ackWaiters = this.ackWaiters.filter((x) => x !== w);
          w.resolve();
        }
        return;
      }
      case 'err': {
        const text = m.msg ?? `Board error ${m.code}.`;
        const pending = this.ackWaiters.shift();
        if (pending) pending.reject(new TransportError(m.code === 102 ? 'board-busy' : 'failed', text));
        else if (this.view.phase === 'playing') this.interrupt(text);
        return;
      }
      case 'tgt':
        return this.onTarget(m);
      case 'ph':
        if (m.p === 'watch') this.set({ hint: 'watch', seqLen: m.len ?? this.view.seqLen, step: 0, lit: [], target: null });
        else this.set({ hint: 'repeat', seqLen: m.len ?? this.view.seqLen, step: 0, lit: [], target: null });
        return;
      case 'hit':
      case 'miss':
        return this.onResult(m);
      case 'end':
        return void this.finish('completed');
      default:
        return;
    }
  }

  private onTarget(m: Extract<BoardToApp, { t: 'tgt' }>) {
    if (this.view.phase !== 'playing') return;
    this.tgtSeq++;
    if (this.offTimer) clearTimeout(this.offTimer);
    if (m.k === 'nohit') {
      this.set({ lit: [], target: null, decoys: [], hint: 'nohit' });
      return;
    }
    if (m.k === 'show') {
      // Memory demo flash: the board turns the LED off by itself after `w` ms.
      this.set({ lit: [m.n], target: null, hint: 'watch' });
      this.offTimer = setTimeout(() => this.set({ lit: [] }), m.w ?? 450);
      return;
    }
    const field = m.f && m.f.length ? m.f : [m.n];
    this.set({ lit: Array.from(new Set([...field, m.n, ...(m.d ?? [])])), target: m.n, decoys: m.d ?? [], hint: 'go' });
  }

  private onResult(m: Extract<BoardToApp, { t: 'hit' | 'miss' }>) {
    if (this.view.phase !== 'playing') return;
    const row = this.collector.push(m);
    if (!row) return;
    const v = this.view;
    // ONE source of truth: every counter on screen is derived from the same event rows that are uploaded
    // and summarised by the server. The live screen cannot drift from the result or the reports.
    const t = tally(this.collector.rows);
    const ok = m.t === 'hit' && m.ok === 1;
    cue(ok ? 'hit' : 'miss');
    const rts = this.collector.rows.filter((r) => r.correct && typeof r.rt_ms === 'number').map((r) => r.rt_ms as number);
    let score = v.score;
    if (this.game === 'memory') {
      if (m.t === 'hit' && m.ok === 1 && typeof m.len === 'number' && m.st === m.len - 1) score = Math.max(score, m.len);
    } else {
      score = t.hits;
    }
    if (this.flashTimer) clearTimeout(this.flashTimer);
    const pressed = m.t === 'hit' ? m.n : null;
    const seqAtResult = this.tgtSeq;
    this.flashTimer = setTimeout(() => {
      // Keep the last target on screen while the feedback shows, then clear it unless a new one arrived.
      this.set(this.tgtSeq === seqAtResult && this.game !== 'memory' ? { flash: null, target: null } : { flash: null });
    }, 260);
    this.set({
      correct: t.hits,
      wrong: t.wrong + t.distractor,
      misses: t.misses,
      score,
      lastRt: m.t === 'hit' ? m.rt : v.lastRt,
      avgRt: rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : null,
      flash: pressed ? { n: pressed, ok } : m.t === 'miss' ? { n: m.n, ok: false } : null,
      lit: [],
      step: this.game === 'memory' && typeof m.st === 'number' ? m.st + 1 : v.step,
      hitCount: this.collector.rows.length,
    });
  }

  // ---- ending ------------------------------------------------------------------------------------------------
  private onClosed(reason: string) {
    if (this.view.phase === 'playing' || this.view.phase === 'countdown') this.interrupt(reason);
    else if (this.view.phase === 'starting') {
      this.ackWaiters.splice(0).forEach((w) => w.reject(new TransportError('unreachable', reason)));
    }
  }

  private interrupt(reason: string) {
    this.runId++; // a start() that is still counting down must not turn into a running round
    this.stopTimers();
    this.transport?.send({ t: 'stop' });
    this.set({ phase: 'interrupted', interruptReason: reason, hitCount: this.collector.rows.length, lit: [], hint: null });
    // A round that is stopped keeps what was played: it is saved on its own and shows in Results and Analytics as "Stopped".
    if (this.collector.rows.length > 0) void this.finish('interrupted');
    else {
      const id = this.view.sessionId;
      if (id) void api.post(`/sessions/${id}/abort`).catch(() => {});
    }
  }

  /** The Stop button. */
  stop(): void {
    if (this.view.phase !== 'playing' && this.view.phase !== 'countdown') return;
    this.interrupt('You stopped the round.');
  }

  /** The app was backgrounded or a call came in: the board cannot pause, so the round is aborted. */
  async abortBackground(): Promise<void> {
    if (this.view.phase !== 'playing' && this.view.phase !== 'countdown' && this.view.phase !== 'starting') return;
    this.runId++;
    this.stopTimers();
    this.transport?.send({ t: 'stop' });
    this.transport?.close();
    this.transport = null;
    const id = this.view.sessionId;
    this.set({ phase: 'error', error: { kind: 'backgrounded', message: 'The round ended because the app left the screen. Rounds cannot pause.' } });
    if (id) await api.post(`/sessions/${id}/abort`).catch(() => {});
  }

  /** Upload what we have. Called when the board says the round is over, or the player saves a partial round. */
  async finish(status: 'completed' | 'interrupted'): Promise<void> {
    if (this.view.phase === 'finishing' || this.view.phase === 'result') return;
    this.stopTimers();
    this.set({ phase: 'finishing', lit: [], hint: null });
    this.transport?.close();
    this.transport = null;

    const id = this.view.sessionId!;
    const endedIso = new Date().toISOString();
    const hits: HitRow[] = this.collector.rows;
    const body = {
      status,
      started_at: this.startedIso || endedIso,
      ended_at: endedIso,
      board_fw: this.view.fw,
      hits,
    };
    try {
      const res = await api.post<FinishResponse>(`/sessions/${id}/finish`, body, { timeoutMs: 20000 });
      if (res.is_pb) cue('pb');
      this.set({ phase: 'result', result: res, saved: 'uploaded' });
    } catch (e) {
      const uid = useAuth.getState().user?.id;
      const retryable = !(e instanceof ApiClientError) || e.code === 'NETWORK' || e.status >= 500 || e.status === 401;
      if (retryable && uid) {
        await addToOutbox({ sessionId: id, userId: uid, body, game: this.game, level: this.level, savedAt: endedIso });
      }
      this.set({ phase: 'result', result: this.localResult(id, body, status), saved: 'outbox' });
    }
  }

  /** Discard a partial round. */
  async discard(): Promise<void> {
    this.runId++;
    this.stopTimers();
    this.transport?.close();
    this.transport = null;
    const id = this.view.sessionId;
    if (id) await api.post(`/sessions/${id}/abort`).catch(() => {});
    this.set({ phase: 'idle', sessionId: null });
  }

  /** Result shown when the server could not be reached: same maths as the server, flagged as saved on this device. */
  private localResult(id: string, body: { started_at: string; ended_at: string; hits: HitRow[]; board_fw: string | null }, status: 'completed' | 'interrupted'): FinishResponse {
    const duration = Math.max(0, Date.parse(body.ended_at) - Date.parse(body.started_at));
    const summary = summarize(this.game, body.hits, { duration_ms: duration });
    const info = PRIMARY_METRIC[this.game];
    const value = primaryValue(summary);
    return {
      session: {
        id,
        user_id: useAuth.getState().user?.id ?? '',
        game: this.game,
        level: this.level,
        transport: this.view.transport,
        board_fw: body.board_fw,
        started_at: body.started_at,
        ended_at: body.ended_at,
        status,
        score: summary.score,
        summary,
        is_pb: false,
      },
      previous: null,
      is_pb: false,
      delta: { key: info.key, label: info.label, unit: info.unit, lower_is_better: info.lowerIsBetter, value, previous: null, change: null, better: null },
      state_change: null,
    };
  }

  private stopTimers() {
    if (this.tick) clearInterval(this.tick);
    this.tick = null;
    if (this.flashTimer) clearTimeout(this.flashTimer);
    if (this.offTimer) clearTimeout(this.offTimer);
  }

  private reset() {
    this.stopTimers();
    this.collector = new RowCollector(() => this.elapsed());
    this.goAt = 0;
    this.ackWaiters = [];
    this.set({
      phase: 'idle', error: null, busyWho: null, interruptReason: null, result: null, saved: null,
      lit: [], target: null, decoys: [], hint: null, seqLen: null, step: 0, score: 0, correct: 0, wrong: 0, misses: 0,
      lastRt: null, avgRt: null, elapsedMs: 0, flash: null, hitCount: 0, countdown: null, sessionId: null,
    });
  }

  /** Demo Mode tap on the mirror */
  press(n: number) {
    this.transport?.press?.(n);
  }

  dispose() {
    this.disposed = true;
    this.runId++;
    this.stopTimers();
    if (this.view.phase === 'playing' || this.view.phase === 'countdown') {
      this.transport?.send({ t: 'stop' });
      const id = this.view.sessionId;
      if (id) void api.post(`/sessions/${id}/abort`).catch(() => {});
    }
    this.transport?.close();
    this.transport = null;
    this.listeners.clear();
  }
}

type TransportBoard = BoardTransport;

class Cancelled extends Error {}

export function usePlay(c: PlayController): PlayView {
  return useSyncExternalStore(c.subscribe, c.getSnapshot, c.getSnapshot);
}

export { isBetter };
