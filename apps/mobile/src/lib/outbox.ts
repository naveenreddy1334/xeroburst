// Results that could not be uploaded (server unreachable, token expired at the end of a round) wait
// here and upload later. The session id makes the upload idempotent, so retrying is always safe.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { FinishResponse, FinishSessionBody } from '@nboard/shared';
import { ApiClientError, request } from './api';
import { useAuth } from '../state/auth';

const KEY = 'nboard.outbox.v1';

export interface OutboxItem {
  sessionId: string;
  userId: string;
  body: FinishSessionBody;
  game: string;
  level: number;
  savedAt: string;
}

async function read(): Promise<OutboxItem[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as OutboxItem[]) : [];
  } catch {
    return [];
  }
}
async function write(items: OutboxItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage full or unavailable: nothing more we can do */
  }
  useOutbox.setState({ count: items.length });
}

export const useOutbox = create<{ count: number }>(() => ({ count: 0 }));

export async function refreshOutboxCount(): Promise<void> {
  useOutbox.setState({ count: (await read()).length });
}

export async function addToOutbox(item: OutboxItem): Promise<void> {
  const items = await read();
  if (!items.some((i) => i.sessionId === item.sessionId)) items.push(item);
  await write(items);
}

let flushing = false;

/** Tries to upload what is waiting for the signed-in user. Safe to call often. */
export async function flushOutbox(): Promise<{ sent: number; remaining: number }> {
  if (flushing) return { sent: 0, remaining: useOutbox.getState().count };
  const uid = useAuth.getState().user?.id;
  if (!uid) return { sent: 0, remaining: useOutbox.getState().count };
  flushing = true;
  let sent = 0;
  try {
    const items = await read();
    const keep: OutboxItem[] = [];
    let stop = false;
    for (const it of items) {
      if (stop || it.userId !== uid) {
        keep.push(it);
        continue;
      }
      try {
        await request<FinishResponse>('POST', `/sessions/${it.sessionId}/finish`, { body: it.body });
        sent++;
      } catch (e) {
        if (e instanceof ApiClientError) {
          if (e.code === 'NETWORK' || e.status >= 500 || e.status === 401) {
            keep.push(it);
            stop = true; // try again later
          } else if (e.status === 404 || e.status === 422 || e.status === 403) {
            // The server will never accept this one (unknown session, invalid data, no longer allowed). Drop it.
          } else {
            keep.push(it);
          }
        } else {
          keep.push(it);
        }
      }
    }
    await write(keep);
    return { sent, remaining: keep.length };
  } finally {
    flushing = false;
  }
}
