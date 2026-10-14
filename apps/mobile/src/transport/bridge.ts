// Laptop bridge: the app talks to the board through the server's WebSocket (spec section 21).
// The ticket from POST /sessions is single-use and valid for 60 seconds.

import { isServerStatus, parseBoardLine } from '@nboard/shared';
import type { AppToBoard, BoardToApp, ServerStatusMsg } from '@nboard/shared';
import { TransportError } from './types';
import type { BoardTransport } from './types';

export class BridgeTransport implements BoardTransport {
  readonly kind = 'bridge' as const;
  private ws: WebSocket | null = null;
  private listeners = new Set<(m: BoardToApp) => void>();
  private closers = new Set<(r: string) => void>();
  private hb: ReturnType<typeof setInterval> | null = null;
  private closedByUs = false;
  status: ServerStatusMsg | null = null;

  constructor(private baseUrl: string, private ticket: string) {}

  connect(): Promise<{ fw: string | null; buttons: number | null }> {
    const url = `${this.baseUrl.replace(/^http/i, 'ws')}/api/v1/board?ticket=${encodeURIComponent(this.ticket)}`;
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (fn: () => void) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          fn();
        }
      };
      const timer = setTimeout(() => done(() => { this.close(); reject(new TransportError('timeout', 'The laptop did not answer in time.')); }), 8000);
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        clearTimeout(timer);
        return reject(new TransportError('unreachable', 'Cannot open the connection to the laptop.'));
      }
      this.ws = ws;
      ws.onmessage = (ev) => {
        const text = typeof ev.data === 'string' ? ev.data : '';
        for (const line of text.split('\n')) {
          if (!line.trim()) continue;
          let raw: unknown;
          try {
            raw = JSON.parse(line);
          } catch {
            continue;
          }
          if (isServerStatus(raw)) {
            this.status = raw;
            if (!settled) {
              if (!raw.board_connected) {
                return done(() => { this.close(); reject(new TransportError('board-offline', 'The laptop has no board connected.')); });
              }
              this.startHeartbeat();
              ws.send(JSON.stringify({ t: 'hello' }));
            }
            continue;
          }
          const m = parseBoardLine(line);
          if (!m) continue;
          if (m.t === 'err' && m.code === 102 && !settled) {
            return done(() => { this.close(); reject(new TransportError('board-busy', 'The board is being used by someone else.')); });
          }
          if (m.t === 'err' && m.code === 101 && !settled) {
            return done(() => { this.close(); reject(new TransportError('failed', 'The laptop refused the connection. Start again.')); });
          }
          if (m.t === 'hello' && !settled) done(() => resolve({ fw: m.fw, buttons: m.btn }));
          this.listeners.forEach((l) => l(m));
        }
      };
      ws.onerror = () => done(() => reject(new TransportError('unreachable', 'Cannot reach the laptop. Check the Wi-Fi.')));
      ws.onclose = (ev) => {
        this.stopHeartbeat();
        if (!settled) {
          if (ev.code === 4409) return done(() => reject(new TransportError('board-busy', 'The board is being used by someone else.')));
          return done(() => reject(new TransportError('unreachable', 'The laptop closed the connection.')));
        }
        if (!this.closedByUs) this.closers.forEach((c) => c('The connection to the laptop was lost.'));
      };
    });
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.hb = setInterval(() => {
      if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t: 'hb' }));
    }, 5000);
  }
  private stopHeartbeat() {
    if (this.hb) clearInterval(this.hb);
    this.hb = null;
  }

  send(msg: AppToBoard) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg));
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
    this.closedByUs = true;
    this.stopHeartbeat();
    try {
      this.ws?.close();
    } catch {
      /* already closed */
    }
    this.listeners.clear();
    this.closers.clear();
  }
}
