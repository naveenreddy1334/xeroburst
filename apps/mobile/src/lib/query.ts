import { QueryClient } from '@tanstack/react-query';
import { ApiClientError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => {
        if (err instanceof ApiClientError && err.status >= 400 && err.status < 500) return false;
        return count < 2;
      },
    },
  },
});
