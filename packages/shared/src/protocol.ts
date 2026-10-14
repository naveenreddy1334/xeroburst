// Board message protocol (section 10.3). Newline-delimited JSON.
// The same lines travel over serial (Arduino Mega), WebSocket (laptop bridge) and Bluetooth LE (ESP32).
// Reaction time is measured on the board's clock.
//
// Fields marked "extension" are additions the app needs for the four games. They are optional and
// documented in docs/protocol.md so the hardware team can agree or change them.

import type { GameSlug } from './games';

/** The board has exactly 10 buttons, numbered 1 to 10. */
export const NBOARD_BUTTONS = 10;
export const MIN_FIRMWARE = '1.1';

/** Nordic UART style service: one write characteristic (app to board), one notify (board to app). */
export const BLE = {
  deviceNamePrefix: 'nBoard',
  serviceUuid: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  writeUuid: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
  notifyUuid: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
  requestedMtu: 185,
} as const;

export type AppToBoard =
  | { t: 'hello' }
  /** `sd` (memory only): seed of the sequence, so every level of one run plays the same order and adds one step. */
  | { t: 'cfg'; g: GameSlug; lv: number; sd?: number }
  | { t: 'go' }
  | { t: 'stop' }
  /** App to server only (keeps the board lock alive). Never forwarded to the board. */
  | { t: 'hb' };

export type TargetKind = 'go' | 'show' | 'nohit';

export type BoardToApp =
  | { t: 'hello'; fw: string; btn: number }
  /** extension: acknowledges cfg, go and stop. */
  | { t: 'ack'; of: 'cfg' | 'go' | 'stop' }
  /**
   * A target is lit. ms = ms since round start.
   * extension: k = kind ('go' press it, 'show' memory demo flash, 'nohit' do nothing),
   * f = LEDs lit in the field (Target Hunt), d = decoy LEDs (do not press), w = response window in ms.
   */
  | { t: 'tgt'; n: number; ms: number; k?: TargetKind; f?: number[]; d?: number[]; w?: number }
  /** extension: Memory Sequence phase marker. len = sequence length. */
  | { t: 'ph'; p: 'watch' | 'repeat'; len?: number; ms?: number }
  /**
   * A press: which button, correct or not, reaction time.
   * extension: tb = the target button, ms = ms since round start, d = 1 if it was a decoy or NO HIT press,
   * len and st = Memory Sequence length and step.
   */
  | { t: 'hit'; n: number; ok: 0 | 1; rt: number; tb?: number; ms?: number; d?: 0 | 1; len?: number; st?: number }
  /** The target timed out. extension: ms, len, st. */
  | { t: 'miss'; n: number; ms?: number; len?: number; st?: number }
  /** Round finished with a summary. extension: ms = round length. */
  | { t: 'end'; score: number; ms?: number }
  | { t: 'err'; code: number; msg?: string };

/** Board error codes. 1 to 99 come from firmware. 100 and above come from the laptop server. */
export const BOARD_ERROR = {
  NOT_CONFIGURED: 1,
  BAD_GAME: 2,
  BAD_LEVEL: 3,
  ALREADY_RUNNING: 4,
  SENSOR_FAULT: 5,
  NOT_CONNECTED: 100,
  NOT_ALLOWED: 101,
  BUSY: 102,
} as const;

export const BOARD_ERROR_TEXT: Record<number, string> = {
  1: 'The board has no game selected.',
  2: 'The board does not know that game.',
  3: 'The board does not support that level.',
  4: 'A round is already running.',
  5: 'A button sensor reported a fault.',
  100: 'The laptop is not connected to a board.',
  101: 'That command is not allowed for this session.',
  102: 'The board is being used by someone else.',
};

export function encodeLine(msg: AppToBoard | BoardToApp): string {
  return JSON.stringify(msg) + '\n';
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isIntList = (v: unknown): v is number[] => Array.isArray(v) && v.every(isInt);

/** Validate a line from the board. Returns null for anything that does not match the protocol. */
export function parseBoardLine(line: string): BoardToApp | null {
  const text = line.trim();
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(raw) || typeof raw.t !== 'string') return null;
  switch (raw.t) {
    case 'hello':
      if (typeof raw.fw === 'string' && isInt(raw.btn)) return { t: 'hello', fw: raw.fw, btn: raw.btn };
      return null;
    case 'ack':
      if (raw.of === 'cfg' || raw.of === 'go' || raw.of === 'stop') return { t: 'ack', of: raw.of };
      return null;
    case 'tgt': {
      if (!isInt(raw.n) || !isInt(raw.ms)) return null;
      const m: BoardToApp = { t: 'tgt', n: raw.n, ms: raw.ms };
      if (raw.k === 'go' || raw.k === 'show' || raw.k === 'nohit') m.k = raw.k;
      if (isIntList(raw.f)) m.f = raw.f;
      if (isIntList(raw.d)) m.d = raw.d;
      if (isInt(raw.w)) m.w = raw.w;
      return m;
    }
    case 'ph':
      if (raw.p === 'watch' || raw.p === 'repeat') {
        const m: BoardToApp = { t: 'ph', p: raw.p };
        if (isInt(raw.len)) m.len = raw.len;
        if (isInt(raw.ms)) m.ms = raw.ms;
        return m;
      }
      return null;
    case 'hit': {
      if (!isInt(raw.n) || !isInt(raw.rt) || (raw.ok !== 0 && raw.ok !== 1)) return null;
      const m: BoardToApp = { t: 'hit', n: raw.n, ok: raw.ok, rt: raw.rt };
      if (isInt(raw.tb)) m.tb = raw.tb;
      if (isInt(raw.ms)) m.ms = raw.ms;
      if (raw.d === 0 || raw.d === 1) m.d = raw.d;
      if (isInt(raw.len)) m.len = raw.len;
      if (isInt(raw.st)) m.st = raw.st;
      return m;
    }
    case 'miss': {
      if (!isInt(raw.n)) return null;
      const m: BoardToApp = { t: 'miss', n: raw.n };
      if (isInt(raw.ms)) m.ms = raw.ms;
      if (isInt(raw.len)) m.len = raw.len;
      if (isInt(raw.st)) m.st = raw.st;
      return m;
    }
    case 'end':
      if (isInt(raw.score)) {
        const m: BoardToApp = { t: 'end', score: raw.score };
        if (isInt(raw.ms)) m.ms = raw.ms;
        return m;
      }
      return null;
    case 'err':
      if (isInt(raw.code)) {
        const m: BoardToApp = { t: 'err', code: raw.code };
        if (typeof raw.msg === 'string') m.msg = raw.msg;
        return m;
      }
      return null;
    default:
      return null;
  }
}

/** Validate a line from the app (used by the laptop relay before anything is forwarded). */
export function parseAppLine(line: string): AppToBoard | null {
  const text = line.trim();
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(raw) || typeof raw.t !== 'string') return null;
  switch (raw.t) {
    case 'hello':
      return { t: 'hello' };
    case 'go':
      return { t: 'go' };
    case 'stop':
      return { t: 'stop' };
    case 'hb':
      return { t: 'hb' };
    case 'cfg':
      if (
        (raw.g === 'quick' || raw.g === 'memory' || raw.g === 'hunt' || raw.g === 'endure') &&
        isInt(raw.lv) &&
        raw.lv >= 1 &&
        raw.lv <= 10
      ) {
        return isInt(raw.sd) && raw.sd >= 0 && raw.sd <= 4294967295 ? { t: 'cfg', g: raw.g, lv: raw.lv, sd: Math.floor(raw.sd) } : { t: 'cfg', g: raw.g, lv: raw.lv };
      }
      return null;
    default:
      return null;
  }
}

/**
 * Collects bytes or text fragments (Bluetooth notifications arrive in small chunks) and yields
 * complete lines.
 */
export class LineBuffer {
  private buf = '';
  push(chunk: string): string[] {
    this.buf += chunk;
    const out: string[] = [];
    let i: number;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).replace(/\r$/, '');
      this.buf = this.buf.slice(i + 1);
      if (line.trim()) out.push(line);
    }
    if (this.buf.length > 4096) this.buf = '';
    return out;
  }
  clear() {
    this.buf = '';
  }
}

/** Compare firmware strings like "1.0" or "1.2.3". Returns negative when a is older than b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Server to app, bridge only. Sent once when the WebSocket is accepted and whenever the board
 * connects or disconnects. The app handles it before handing lines to parseBoardLine.
 */
export interface ServerStatusMsg {
  t: 'srv';
  session: string;
  board_connected: boolean;
  fw: string | null;
  btn: number | null;
  /** Level cap the server enforces on cfg for this session */
  level_cap: number;
}

export function isServerStatus(v: unknown): v is ServerStatusMsg {
  return typeof v === 'object' && v !== null && (v as { t?: unknown }).t === 'srv';
}
