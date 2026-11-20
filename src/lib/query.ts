// TanStack Query client. In memory only: Google content (ratings, hours, photos…) is never persisted.
import { QueryClient } from '@tanstack/react-query';
import { retryable } from './api';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60_000,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: (n, e) => n < 1 && retryable(e),
      },
    },
  });
}
