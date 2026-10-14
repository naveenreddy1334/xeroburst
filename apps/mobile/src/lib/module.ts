// The module the current training flow belongs to (nboard, nbase, ncourt, npad). Set when a module card is
// opened; read when a round is created, so the server stores which module the round was played in.

import type { ModuleKey } from '@nboard/shared';
import { useSyncExternalStore } from 'react';

let current: ModuleKey = 'nboard';
const subs = new Set<() => void>();

export function setModule(m: ModuleKey) {
  if (m === current) return;
  current = m;
  subs.forEach((f) => f());
}
export const getModule = (): ModuleKey => current;
export function useModule(): ModuleKey {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => current,
    () => current,
  );
}
