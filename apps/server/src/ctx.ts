import type { DB } from './db/index.js';
import type { Config } from './config.js';
import type { BoardHub } from './board/hub.js';
import type { PublicSettings } from '@nboard/shared';

export interface TicketInfo {
  sessionId: string;
  userId: string;
  userName: string;
  game: string;
  level: number;
  levelCap: number;
  expires: number;
}

export interface Ctx {
  db: DB;
  cfg: Config;
  hub: BoardHub;
  tickets: Map<string, TicketInfo>;
  /** scrypt cost; lowered in tests */
  hashN: number;
  settings(): PublicSettings;
}
