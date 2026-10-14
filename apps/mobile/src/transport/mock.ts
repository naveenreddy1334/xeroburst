// Demo Mode: the software board from the shared package runs inside the app.
import { BoardSim, SimBot } from '@nboard/shared';
import type { AppToBoard, BoardToApp } from '@nboard/shared';
import type { BoardTransport } from './types';

export class MockTransport implements BoardTransport {
  readonly kind = 'mock' as const;
  private sim = new BoardSim();
  private bot: SimBot | null = null;
  private listeners = new Set<(m: BoardToApp) => void>();
  private closers = new Set<(r: string) => void>();
  private off: (() => void) | null = null;
  private fw: string | null = null;

  constructor(private opts: { bot?: boolean; skill?: number } = {}) {
    if (opts.bot) this.bot = new SimBot(this.sim, { skill: opts.skill ?? 0.62 });
  }

  async connect() {
    this.off = this.sim.onMessage((m) => {
      if (m.t === 'hello') this.fw = m.fw;
      this.listeners.forEach((l) => l(m));
    });
    this.sim.receive({ t: 'hello' });
    return { fw: this.fw, buttons: 12 };
  }

  send(msg: AppToBoard) {
    if (msg.t === 'cfg' && this.bot) {
      this.bot.attach();
      this.bot.configure(msg.g, msg.lv);
    }
    this.sim.receive(msg);
  }

  press(n: number) {
    this.sim.press(n);
  }

  onMessage(cb: (m: BoardToApp) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  onClose(cb: (r: string) => void) {
    this.closers.add(cb);
    return () => this.closers.delete(cb);
  }
  close() {
    this.bot?.detach();
    this.off?.();
    this.sim.dispose();
    this.listeners.clear();
    this.closers.clear();
  }
}
