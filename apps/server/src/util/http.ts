import { z } from 'zod';
import { ApiError } from '../errors.js';

/** Validates with a shared zod schema; failures become 422 with field messages. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data ?? {});
  if (r.success) return r.data;
  const fields: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  throw new ApiError('VALIDATION', { fields });
}

export function page<T>(items: T[], limit: number, cursorOf: (t: T) => string): { items: T[]; next_cursor: string | null } {
  const more = items.length > limit;
  const out = more ? items.slice(0, limit) : items;
  return { items: out, next_cursor: more ? cursorOf(out[out.length - 1]!) : null };
}

export const pagingQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(200).optional(),
});

export function encodeCursor(o: unknown): string {
  return Buffer.from(JSON.stringify(o)).toString('base64url');
}
export function decodeCursor<T>(c: string | undefined): T | null {
  if (!c) return null;
  try {
    return JSON.parse(Buffer.from(c, 'base64url').toString('utf8')) as T;
  } catch {
    throw new ApiError('VALIDATION', { fields: { cursor: 'Invalid cursor.' } });
  }
}
