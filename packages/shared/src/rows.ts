// Turns the stream of board messages into HitRow records (the hits table, section 16.2).
// Used by the app while a round runs and by tests and demo data on the server.

import type { BoardToApp } from './protocol';
import type { HitRow } from './metrics';

export class RowCollector {
  readonly rows: HitRow[] = [];
  constructor(private clock: () => number = () => 0) {}

  /** Returns the new row if the message produced one. */
  push(msg: BoardToApp): HitRow | null {
    if (msg.t === 'hit') {
      const row: HitRow = {
        seq: this.rows.length,
        target_btn: msg.tb ?? null,
        pressed_btn: msg.n,
        rt_ms: Math.max(0, Math.round(msg.rt)),
        correct: msg.ok === 1,
        distractor: msg.d === 1,
        t_ms: Math.max(0, Math.round(msg.ms ?? this.clock())),
        len: msg.len ?? null,
        step: msg.st ?? null,
      };
      this.rows.push(row);
      return row;
    }
    if (msg.t === 'miss') {
      const row: HitRow = {
        seq: this.rows.length,
        target_btn: msg.n,
        pressed_btn: null,
        rt_ms: null,
        correct: false,
        distractor: false,
        t_ms: Math.max(0, Math.round(msg.ms ?? this.clock())),
        len: msg.len ?? null,
        step: msg.st ?? null,
      };
      this.rows.push(row);
      return row;
    }
    return null;
  }
}

export function eventsToRows(log: BoardToApp[]): HitRow[] {
  const c = new RowCollector();
  for (const m of log) c.push(m);
  return c.rows;
}
