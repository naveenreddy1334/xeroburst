// Picks the transport for a round (spec section 10.2):
//   1. the mode forced in Settings (Auto, Bluetooth, Laptop bridge, Demo)
//   2. Auto: the last one that worked
//   3. otherwise scan Bluetooth for about 3 seconds
//   4. otherwise the bridge through the connected server
//   5. otherwise offer Retry and Demo Mode

import { Platform } from 'react-native';
import type { BoardStatus } from '@nboard/shared';
import { usePrefs } from '../state/prefs';
import type { TransportMode } from '../state/prefs';
import { bleSupported, scanForBoard, BleTransport } from './ble';
import { BridgeTransport } from './bridge';
import { MockTransport } from './mock';
import { TransportError } from './types';
import type { BoardTransport, TransportKind } from './types';

export { TransportError, TRANSPORT_LABEL } from './types';
export type { BoardTransport, TransportKind, TransportFailure } from './types';

export interface Choice {
  kind: TransportKind;
  /** Bluetooth device found during the scan */
  deviceId?: string;
}

/** Decides which transport to use *before* the session is created (the session records it). */
export async function chooseTransport(mode: TransportMode, board: BoardStatus | null): Promise<Choice> {
  const prefs = usePrefs.getState();
  if (mode === 'mock') return { kind: 'mock' };
  if (mode === 'bridge') return { kind: 'bridge' };
  if (mode === 'ble') {
    if (!bleSupported()) throw new TransportError('unsupported', Platform.OS === 'web' ? 'Bluetooth is not available in a browser.' : 'Bluetooth needs the installed app, not Expo Go.');
    const dev = await scanForBoard(5000);
    if (!dev) throw new TransportError('not-found', 'No XeroBurst board found nearby. Is the board switched on?');
    return { kind: 'ble', deviceId: dev.id };
  }

  // Auto
  const last = prefs.lastTransport;
  const bridgeOk = !!board?.connected;
  // The laptop already has the board: no need to spend 3 seconds scanning for Bluetooth first.
  if (bridgeOk && last !== 'ble') return { kind: 'bridge' };
  if (bleSupported()) {
    try {
      const dev = await scanForBoard(3000);
      if (dev) return { kind: 'ble', deviceId: dev.id };
    } catch (e) {
      if (e instanceof TransportError && (e.reason === 'bluetooth-off' || e.reason === 'permission-denied')) {
        if (!bridgeOk) throw e;
      }
    }
  }
  if (bridgeOk) return { kind: 'bridge' };
  throw new TransportError('not-found', 'No board found by Bluetooth or through the laptop.');
}

export function createTransport(choice: Choice, ctx: { serverUrl: string; ticket?: string }): BoardTransport {
  switch (choice.kind) {
    case 'ble':
      return new BleTransport(choice.deviceId);
    case 'bridge':
      if (!ctx.ticket) throw new TransportError('failed', 'Missing board ticket.');
      return new BridgeTransport(ctx.serverUrl, ctx.ticket);
    case 'mock':
      return new MockTransport({ bot: usePrefs.getState().demoBot });
  }
}
