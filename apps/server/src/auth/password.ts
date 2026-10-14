// scrypt hashing (section 11.4). Parameters travel with the hash so they can be raised later.

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

const KEYLEN = 32;

function derive(secret: string, salt: Buffer, N: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(secret.normalize('NFKC'), salt, KEYLEN, { N, r, p, maxmem: 128 * N * r * 2 + 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashSecret(secret: string, N = 16384): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(secret, salt, N, 8, 1);
  return `scrypt$${N}$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [N, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  const salt = Buffer.from(parts[4]!, 'base64');
  const expected = Buffer.from(parts[5]!, 'base64');
  const key = await derive(secret, salt, N, r, p);
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Used when the login ID does not exist, so response time does not reveal it. */
let dummy: string | null = null;
export async function dummyVerify(secret: string, N = 16384): Promise<void> {
  dummy ??= await hashSecret('not-a-real-secret', N);
  await verifySecret(secret, dummy);
}

const PW_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A readable temporary password with letters and digits, 12 characters. */
export function generateTempPassword(): string {
  const bytes = randomBytes(12);
  let out = '';
  for (const b of bytes) out += PW_ALPHABET[b % PW_ALPHABET.length];
  return out.slice(0, 8) + '-' + out.slice(8) + String(1 + (bytes[0]! % 9));
}

/** Random PIN of the given length that is not a simple run or repeat. */
export function generatePin(isSimple: (p: string) => boolean, len = 6): string {
  for (let i = 0; i < 100; i++) {
    const b = randomBytes(len);
    const pin = [...b].map((x) => String(x % 10)).join('');
    if (!isSimple(pin)) return pin;
  }
  return '482915';
}
