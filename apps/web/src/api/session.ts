import { type Session, sessionSchema, type LoginInput } from '@acme/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiRequest } from './client';

export const SESSION_QUERY_KEY = ['session'] as const;

/**
 * Who is logged in: the session, or null when nobody is. Asking the server (rather than
 * remembering in the browser) keeps it correct after a reload, an expiry or a logout in
 * another tab.
 */
export function useSession() {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: async (): Promise<Session | null> => {
      try {
        return await apiRequest('/api/auth/me', { schema: sessionSchema });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 60_000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) =>
      apiRequest('/api/auth/login', { method: 'POST', body: input, schema: sessionSchema }),
    onSuccess: (session) => {
      queryClient.setQueryData(SESSION_QUERY_KEY, session);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest('/api/auth/logout', { method: 'POST' }),
    onSettled: () => {
      // Forget everything that was loaded as the previous user, salary data included, and
      // record that nobody is logged in so the protected pages send the visitor to log in.
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== SESSION_QUERY_KEY[0],
      });
      queryClient.setQueryData(SESSION_QUERY_KEY, null);
    },
  });
}
