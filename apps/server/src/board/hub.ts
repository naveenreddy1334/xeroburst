// The board relay (section 21). One board, one lock. The laptop talks to the board over USB serial
// (Arduino Mega) or, for testing without hardware, a built-in simulator that plays itself with a bot.

import {
  BOARD_ERROR,
  BoardSim,
  LineBuffer,
  NBOARD_BUTTONS,
  SimBot,
  encodeLine,
  parseBoardLine,
} from '@nboard/shared';
import type { AppToBoard, BoardStatus, BoardToApp, GameSlug, ServerStatusMsg } from '@nboard/shared';

export interface BoardLink {
  readonly mode: 'serial' | 'sim';
  connected: boolean;
  fw: string | null;
  buttons: number | null;
  port: string | null;
  send(msg: AppToBoard): void;
  close(): void;
}

export interface Sink {
  send(msg: BoardToApp | ServerStatusMsg): void;
  close(): void;
}

export interface Lock {
  sessionId: string;
  userId: string;
  userName: string;
  game: GameSlug;
  level: number;
  levelCap: number;
  since: number;
  lastBeat: number;
  sink: Sink;
}

type Log = { info(m: string): void; warn(m: string): void };

export const HEARTBEAT_TIMEOUT_MS = 30_000;

export class BoardHub {
  private link: BoardLink | null = null;
  private lock: Lock | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  /** Called when the heartbeat is lost so the session can be marked interrupted. */
  onLockLost: (sessionId: string) => void = () => {};

  constructor(
    private opts: { sim: boolean; port: string | null; heartbeatMs?: number; log?: Log },
  ) {}

  private get log(): Log {
    return this.opts.log ?? { info: () => {}, warn: () => {} };
  }

  async start(): Promise<void> {
    this.stopped = false;
    if (this.opts.sim) {
      this.link = new SimLink();
      this.attachSim();
      this.log.info('Board: built-in simulator (a bot plays each round).');
    } else {
      void this.connectSerial();
    }
    this.timer = setInterval(() => this.checkHeartbeat(), 2000);
    this.timer.unref?.();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    if (this.retry) clearTimeout(this.retry);
    this.lock?.sink.close();
    this.lock = null;
    this.link?.close();
    this.link = null;
  }

  // ---- Serial --------------------------------------------------------------------------------------

  private async connectSerial(): Promise<void> {
    if (this.stopped) return;
    try {
      const link = await SerialLink.open(this.opts.port, (m) => this.onBoardMsg(m), () => {
        this.link = null;
        this.notifyBoardState();
        this.scheduleRetry();
      });
      if (link) {
        this.link = link;
        this.log.info(`Board: connected on ${link.port}, firmware ${link.fw ?? 'unknown'}.`);
        this.notifyBoardState();
        return;
      }
    } catch (e) {
      this.log.warn(`Board: ${(e as Error).message}`);
    }
    this.scheduleRetry();
  }

  private scheduleRetry() {
    if (this.stopped) return;
    this.retry = setTimeout(() => void this.connectSerial(), 4000);
    this.retry.unref?.();
  }

  // ---- Status and lock ---------------------------------------------------------------------------------

  status(staff: boolean): BoardStatus {
    const l = this.link;
    return {
      mode: l ? l.mode : 'none',
      connected: !!l?.connected,
      port: l?.port ?? null,
      firmware: l?.fw ?? null,
      buttons: l?.buttons ?? null,
      busy: this.lock !== null,
      held_by: staff && this.lock ? { name: this.lock.userName, since: new Date(this.lock.since).toISOString() } : null,
    };
  }

  holderName(): string | null {
    return this.lock?.userName ?? null;
  }

  isHeldByOther(_userId: string, sessionId: string): boolean {
    return this.lock !== null && this.lock.sessionId !== sessionId;
  }

  holds(sessionId: string): boolean {
    return this.lock?.sessionId === sessionId;
  }

  /** Gives the lock to a session. Returns false when somebody else holds it. */
  acquire(info: Omit<Lock, 'since' | 'lastBeat'>): boolean {
    if (this.lock && this.lock.sessionId !== info.sessionId) return false;
    if (this.lock) this.lock.sink.close(); // same session reconnecting
    this.lock = { ...info, since: Date.now(), lastBeat: Date.now() };
    const l = this.link;
    info.sink.send({
      t: 'srv',
      session: info.sessionId,
      board_connected: !!l?.connected,
      fw: l?.fw ?? null,
      btn: l?.buttons ?? null,
      level_cap: info.levelCap,
    });
    return true;
  }

  /** Frees the lock if this session holds it, and tells the board to stop. */
  release(sessionId: string): void {
    if (this.lock?.sessionId !== sessionId) return;
    this.link?.send({ t: 'stop' });
    const sink = this.lock.sink;
    this.lock = null;
    sink.close();
  }

  private notifyBoardState() {
    const l = this.link;
    this.lock?.sink.send({
      t: 'srv',
      session: this.lock.sessionId,
      board_connected: !!l?.connected,
      fw: l?.fw ?? null,
      btn: l?.buttons ?? null,
      level_cap: this.lock.levelCap,
    });
  }

  private checkHeartbeat() {
    const lock = this.lock;
    if (!lock) return;
    if (Date.now() - lock.lastBeat > (this.opts.heartbeatMs ?? HEARTBEAT_TIMEOUT_MS)) {
      this.log.warn(`Board: heartbeat lost for session ${lock.sessionId}, releasing.`);
      this.link?.send({ t: 'stop' });
      lock.sink.send({ t: 'err', code: BOARD_ERROR.BUSY, msg: 'Connection lost. The round was stopped.' });
      lock.sink.close();
      this.lock = null;
      this.onLockLost(lock.sessionId);
    }
  }

  // ---- Traffic ----------------------------------------------------------------------------------------

  /** A command from the lock holder. Everything is filtered here before the board sees it. */
  fromApp(sessionId: string, msg: AppToBoard): void {
    const lock = this.lock;
    if (!lock || lock.sessionId !== sessionId) return;
    if (msg.t === 'hb') {
      lock.lastBeat = Date.now();
      return;
    }
    lock.lastBeat = Date.now();
    const link = this.link;
    if (!link || !link.connected) {
      lock.sink.send({ t: 'err', code: BOARD_ERROR.NOT_CONNECTED });
      return;
    }
    if (msg.t === 'cfg') {
      // Only the approved game, at or below the level cap.
      if (msg.g !== lock.game || msg.lv > lock.levelCap || msg.lv < 1) {
        lock.sink.send({ t: 'err', code: BOARD_ERROR.NOT_ALLOWED });
        return;
      }
      if (link instanceof SimLink) link.prepareBot(msg.g, msg.lv);
    }
    link.send(msg);
  }

  private onBoardMsg(m: BoardToApp) {
    this.lock?.sink.send(m);
  }

  /** Wires the simulator's messages to the lock holder. */
  attachSim(): void {
    if (this.link instanceof SimLink) this.link.sim.onMessage((m) => this.onBoardMsg(m));
  }
}

// ---- Simulator link ------------------------------------------------------------------------------------

class SimLink implements BoardLink {
  readonly mode = 'sim' as const;
  connected = true;
  fw: string | null = null;
  buttons: number | null = NBOARD_BUTTONS;
  port: string | null = 'simulator';
  readonly sim = new BoardSim();
  private bot: SimBot;

  constructor() {
    this.bot = new SimBot(this.sim, { skill: 0.65 });
    this.sim.onMessage((m) => {
      if (m.t === 'hello') this.fw = m.fw;
    });
    this.sim.receive({ t: 'hello' });
  }

  prepareBot(game: GameSlug, level: number) {
    this.bot.attach();
    this.bot.configure(game, level);
  }
  send(msg: AppToBoard) {
    this.sim.receive(msg);
  }
  close() {
    this.bot.detach();
    this.sim.dispose();
  }
}

// ---- Serial link ---------------------------------------------------------------------------------------

type PortInfo = { path: string; vendorId?: string; manufacturer?: string };

class SerialLink implements BoardLink {
  readonly mode = 'serial' as const;
  connected = true;
  fw: string | null = null;
  buttons: number | null = null;
  private lines = new LineBuffer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private sp: any, public port: string, private onMsg: (m: BoardToApp) => void) {
    sp.on('data', (buf: Buffer) => {
      for (const line of this.lines.push(buf.toString('utf8'))) {
        const m = parseBoardLine(line);
        if (!m) continue;
        if (m.t === 'hello') {
          this.fw = m.fw;
          this.buttons = m.btn;
        }
        this.onMsg(m);
      }
    });
  }

  send(msg: AppToBoard) {
    if (msg.t === 'hb') return;
    this.sp.write(encodeLine(msg));
  }
  close() {
    this.connected = false;
    try {
      this.sp.close();
    } catch {
      /* already closed */
    }
  }

  /** Returns null when no board was found (so the caller retries). */
  static async open(
    wanted: string | null,
    onMsg: (m: BoardToApp) => void,
    onClose: () => void,
  ): Promise<SerialLink | null> {
    let mod: { SerialPort: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      const name = 'serialport';
      mod = (await import(/* @vite-ignore */ name)) as typeof mod;
    } catch {
      throw new Error('The optional "serialport" package is not installed, so no USB board can be used. Use the simulator: npm run server:sim');
    }
    const { SerialPort } = mod;
    let path = wanted;
    if (!path) {
      const ports = (await SerialPort.list()) as PortInfo[];
      const hit = ports.find(
        (p) => p.vendorId === '2341' || p.vendorId === '1a86' || p.vendorId === '0403' || /arduino|wch|ftdi/i.test(p.manufacturer ?? ''),
      );
      path = hit?.path ?? null;
    }
    if (!path) return null;
    const sp = new SerialPort({ path, baudRate: 115200, autoOpen: false });
    await new Promise<void>((resolve, reject) => sp.open((err: Error | null) => (err ? reject(err) : resolve())));
    const link = new SerialLink(sp, path, onMsg);
    sp.on('close', () => {
      link.connected = false;
      onClose();
    });
    sp.on('error', () => {
      link.connected = false;
    });
    // An Arduino resets when the port opens; give it a moment, then say hello.
    await new Promise((r) => setTimeout(r, 1800));
    link.send({ t: 'hello' });
    await new Promise((r) => setTimeout(r, 400));
    return link;
  }
}
