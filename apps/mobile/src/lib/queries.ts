// Thin TanStack Query helpers over the api client. Keys are the path plus query, so any screen can
// refresh any list by invalidating a path prefix.

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Page } from '@nboard/shared';
import { api } from './api';

type Q = Record<string, string | number | boolean | undefined | null>;

export function useGet<T>(path: string | null, query?: Q, opts: { enabled?: boolean; refetchInterval?: number } = {}) {
  return useQuery({
    queryKey: [path, query ?? null],
    queryFn: () => api.get<T>(path!, query),
    enabled: path !== null && opts.enabled !== false,
    refetchInterval: opts.refetchInterval,
  });
}

export function usePaged<T>(path: string, query?: Q, enabled = true) {
  const q = useInfiniteQuery({
    queryKey: [path, query ?? null, 'paged'],
    queryFn: ({ pageParam }) => api.get<Page<T>>(path, { ...query, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled,
  });
  const items = (q.data?.pages ?? []).flatMap((p) => p.items);
  return { ...q, items };
}

export function useInvalidate() {
  const qc = useQueryClient();
  return (...prefixes: string[]) => {
    if (!prefixes.length) return qc.invalidateQueries();
    return qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === 'string' && prefixes.some((p) => (q.queryKey[0] as string).startsWith(p)) });
  };
}

type Method = 'post' | 'put' | 'patch' | 'del';

/** A write. `invalidate` lists path prefixes to refresh afterwards; with none, everything refreshes. */
export function useSend<R = unknown, B = unknown>(method: Method, path: string | ((b: B) => string), invalidate: string[] = []) {
  const inv = useInvalidate();
  return useMutation<R, Error, B>({
    mutationFn: (body) => {
      const p = typeof path === 'function' ? path(body) : path;
      return method === 'del' ? api.del<R>(p) : api[method]<R>(p, body);
    },
    onSuccess: () => {
      void inv(...invalidate);
    },
  });
}
