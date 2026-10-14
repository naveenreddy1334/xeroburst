// Web and any platform without Bluetooth: an honest stub. The real implementation is
// ble.native.ts, picked automatically by Metro on iOS and Android.

import type { AppToBoard, BoardToApp } from '@nboard/shared';
import { TransportError } from './types';
import type { BoardTransport } from './types';

export function bleSupported(): boolean {
  return false;
}

export type BlePermission = 'granted' | 'denied' | 'blocked';

export async function ensureBlePermissions(): Promise<BlePermission> {
  return 'denied';
}

export async function scanForBoard(_ms = 3000): Promise<{ id: string; name: string | null } | null> {
  return null;
}

export async function openBluetoothSettings(): Promise<void> {}

export class BleTransport implements BoardTransport {
  readonly kind = 'ble' as const;
  constructor(_deviceId?: string) {}
  async connect(): Promise<{ fw: string | null; buttons: number | null }> {
    throw new TransportError('unsupported', 'Bluetooth is not available on this device. Use the laptop bridge or Demo Mode.');
  }
  send(_m: AppToBoard) {}
  onMessage(_cb: (m: BoardToApp) => void) {
    return () => {};
  }
  onClose(_cb: (r: string) => void) {
    return () => {};
  }
  close() {}
}
