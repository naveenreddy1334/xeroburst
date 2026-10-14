// Bluetooth LE to the board (ESP32 style: Nordic UART service). Needs a development build or an
// installed app: Expo Go does not contain the Bluetooth module, so everything here is loaded lazily and
// reports "unsupported" instead of crashing.

import { Linking, PermissionsAndroid, Platform } from 'react-native';
import { BLE, LineBuffer, encodeLine, parseBoardLine } from '@nboard/shared';
import type { AppToBoard, BoardToApp } from '@nboard/shared';
import type { BleManager as BleManagerType, Device } from 'react-native-ble-plx';
import { TransportError } from './types';
import type { BoardTransport } from './types';

type BlePlx = typeof import('react-native-ble-plx');

let plx: BlePlx | null | undefined;
let manager: BleManagerType | null = null;

function load(): BlePlx | null {
  if (plx !== undefined) return plx;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    plx = require('react-native-ble-plx') as BlePlx;
    // Constructing the manager throws when the native module is missing (Expo Go).
    manager = new plx.BleManager();
  } catch {
    plx = null;
    manager = null;
  }
  return plx;
}

export function bleSupported(): boolean {
  if (Platform.isTV) return false; // many TV boxes have weak Bluetooth: use the bridge
  return load() !== null && manager !== null;
}

export type BlePermission = 'granted' | 'denied' | 'blocked';

export async function ensureBlePermissions(): Promise<BlePermission> {
  if (Platform.OS !== 'android') return 'granted'; // iOS asks the first time Bluetooth is used
  const api = Number(Platform.Version);
  const wanted =
    api >= 31
      ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const res = await PermissionsAndroid.requestMultiple(wanted);
  const values = Object.values(res);
  if (values.every((v) => v === PermissionsAndroid.RESULTS.GRANTED)) return 'granted';
  if (values.some((v) => v === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN)) return 'blocked';
  return 'denied';
}

export async function openBluetoothSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch {
    /* ignore */
  }
}

async function poweredOn(m: BleManagerType): Promise<boolean> {
  const state = await m.state();
  if (state === 'PoweredOn') return true;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      sub.remove();
      resolve(false);
    }, 2500);
    const sub = m.onStateChange((s) => {
      if (s === 'PoweredOn') {
        clearTimeout(timer);
        sub.remove();
        resolve(true);
      }
    }, true);
  });
}

/** Scans for the XeroBurst board service. Resolves with the first board found, or null. */
export async function scanForBoard(ms = 3000): Promise<{ id: string; name: string | null } | null> {
  if (!bleSupported() || !manager) return null;
  const m = manager;
  if (!(await poweredOn(m))) throw new TransportError('bluetooth-off', 'Bluetooth is switched off. Turn it on and try again.');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      m.stopDeviceScan().catch(() => {});
      resolve(null);
    }, ms);
    m.startDeviceScan([BLE.serviceUuid], { allowDuplicates: false }, (err, dev) => {
      if (err) {
        clearTimeout(timer);
        m.stopDeviceScan().catch(() => {});
        return reject(new TransportError('failed', err.message));
      }
      if (dev) {
        clearTimeout(timer);
        m.stopDeviceScan().catch(() => {});
        resolve({ id: dev.id, name: dev.name ?? dev.localName ?? null });
      }
    });
  });
}

const b64enc = (s: string): string => globalThis.btoa(unescape(encodeURIComponent(s)));
const b64dec = (s: string): string => {
  const bin = globalThis.atob(s);
  try {
    return decodeURIComponent(escape(bin));
  } catch {
    return bin;
  }
};

export class BleTransport implements BoardTransport {
  readonly kind = 'ble' as const;
  private device: Device | null = null;
  private lines = new LineBuffer();
  private listeners = new Set<(m: BoardToApp) => void>();
  private closers = new Set<(r: string) => void>();
  private closedByUs = false;
  private chunk = 20;
  private queue: Promise<void> = Promise.resolve();

  constructor(private deviceId?: string) {}

  async connect(): Promise<{ fw: string | null; buttons: number | null }> {
    if (!bleSupported() || !manager) throw new TransportError('unsupported', 'Bluetooth needs the installed app (not Expo Go).');
    const m = manager;
    const perm = await ensureBlePermissions();
    if (perm !== 'granted') throw new TransportError('permission-denied', 'Bluetooth permission is needed to find the board.', { blocked: perm === 'blocked' });
    let id = this.deviceId;
    if (!id) {
      const found = await scanForBoard(4000);
      if (!found) throw new TransportError('not-found', 'No XeroBurst board found nearby. Is the board switched on?');
      id = found.id;
    }
    try {
      let dev = await m.connectToDevice(id, { timeout: 8000, requestMTU: BLE.requestedMtu });
      dev = await dev.discoverAllServicesAndCharacteristics();
      this.device = dev;
      this.chunk = Math.max(20, (dev.mtu ?? 23) - 3);
      dev.onDisconnected(() => {
        if (!this.closedByUs) this.closers.forEach((c) => c('The Bluetooth connection to the board was lost.'));
      });
      let helloResolve: (v: { fw: string | null; buttons: number | null }) => void = () => {};
      const hello = new Promise<{ fw: string | null; buttons: number | null }>((r) => (helloResolve = r));
      dev.monitorCharacteristicForService(BLE.serviceUuid, BLE.notifyUuid, (err, ch) => {
        if (err || !ch?.value) return;
        for (const line of this.lines.push(b64dec(ch.value))) {
          const msg = parseBoardLine(line);
          if (!msg) continue;
          if (msg.t === 'hello') helloResolve({ fw: msg.fw, buttons: msg.btn });
          this.listeners.forEach((l) => l(msg));
        }
      });
      this.send({ t: 'hello' });
      return await Promise.race([
        hello,
        new Promise<never>((_, rej) => setTimeout(() => rej(new TransportError('timeout', 'The board did not answer.')), 4000)),
      ]);
    } catch (e) {
      this.close();
      if (e instanceof TransportError) throw e;
      throw new TransportError('failed', e instanceof Error ? e.message : 'Could not connect to the board.');
    }
  }

  send(msg: AppToBoard) {
    if (!this.device || msg.t === 'hb') return;
    const text = encodeLine(msg);
    const dev = this.device;
    // Writes are queued one after another and split to the negotiated packet size.
    this.queue = this.queue
      .then(async () => {
        for (let i = 0; i < text.length; i += this.chunk) {
          await dev.writeCharacteristicWithResponseForService(BLE.serviceUuid, BLE.writeUuid, b64enc(text.slice(i, i + this.chunk)));
        }
      })
      .catch(() => {});
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
    const d = this.device;
    this.device = null;
    d?.cancelConnection().catch(() => {});
    this.listeners.clear();
    this.closers.clear();
  }
}
