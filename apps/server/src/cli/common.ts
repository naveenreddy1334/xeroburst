import readline from 'node:readline';
import { loadConfig } from '../config.js';
import { openDb } from '../db/index.js';

export function openFromEnv() {
  const cfg = loadConfig();
  return { cfg, db: openDb(cfg.dbFile) };
}

export function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
export const hasFlag = (name: string) => process.argv.includes(`--${name}`);

/** Asks a question on the terminal. Hidden input for secrets. */
export function ask(question: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise((resolve) => {
    rl.on('close', () => resolve('')); // only wins if no answer came (input ended)
    if (hidden) {
      const rlAny = rl as unknown as { _writeToOutput: (s: string) => void };
      process.stdout.write(question);
      rlAny._writeToOutput = () => {};
      rl.question('', (a) => {
        resolve(a);
        rl.close();
        process.stdout.write('\n');
      });
    } else {
      rl.question(question, (a) => {
        resolve(a.trim());
        rl.close();
      });
    }
  });
}
