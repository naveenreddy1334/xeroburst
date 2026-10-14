import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PORT } from '@nboard/shared';

const here = path.dirname(fileURLToPath(import.meta.url));

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  dbFile: string;
  /** ':memory:' in tests */
  jwtSecretFile: string;
  version: string;
  minAppVersion: string;
  boardSim: boolean;
  boardPort: string | null;
  /** Do not start the board link at all (tests, CLI tools) */
  noBoard: boolean;
  accessTtlSec: number;
  refreshTtlDays: number;
  /** Disable scrypt cost and rate limits in tests */
  test: boolean;
}

export function loadConfig(over: Partial<Config> = {}): Config {
  const dataDir = process.env.NBOARD_DATA_DIR ?? path.resolve(here, '../data');
  const cfg: Config = {
    port: Number(process.env.PORT ?? DEFAULT_PORT),
    host: process.env.HOST ?? '0.0.0.0',
    dataDir,
    dbFile: process.env.NBOARD_DB ?? path.join(dataDir, 'nboard.db'),
    jwtSecretFile: path.join(dataDir, 'jwt.secret'),
    version: '1.0.0',
    minAppVersion: '1.0.0',
    boardSim: process.env.BOARD_SIM === '1' || process.argv.includes('--sim'),
    boardPort: process.env.BOARD_PORT ?? null,
    noBoard: false,
    accessTtlSec: 15 * 60,
    refreshTtlDays: 30,
    test: false,
    ...over,
  };
  if (cfg.dbFile !== ':memory:') fs.mkdirSync(path.dirname(cfg.dbFile), { recursive: true });
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  return cfg;
}
