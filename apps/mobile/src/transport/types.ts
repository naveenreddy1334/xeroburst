import type { AppToBoard, BoardToApp } from '@nboard/shared';

export type TransportKind = 'ble' | 'bridge' | 'mock';

export type TransportFailure =
  | 'permission-denied' // Bluetooth permission refused
  | 'bluetooth-off'
  | 'not-found' // no board found
  | 'board-busy'
  | 'board-offline' // server has no board
  | 'unreachable'
  | 'timeout'
  | 'unsupported'
  | 'failed';

export class TransportError extends Error {
  constructor(public reason: TransportFailure, message: string, public details?: Record<string, unknown>) {
    super(message);
  }
}

export interface BoardTransport {
  readonly kind: TransportKind;
  /** Opens the link and says hello. Resolves with what the board reported. */
  connect(): Promise<{ fw: string | null; buttons: number | null }>;
  send(msg: AppToBoard): void;
  onMessage(cb: (m: BoardToApp) => void): () => void;
  onClose(cb: (reason: string) => void): () => void;
  close(): void;
  /** Demo Mode only: press a virtual button */
  press?(n: number): void;
}

export const TRANSPORT_LABEL: Record<TransportKind, string> = {
  ble: 'Bluetooth',
  bridge: 'Laptop bridge',
  mock: 'Demo Mode',
};
