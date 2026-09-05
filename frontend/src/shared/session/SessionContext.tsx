import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '@shared/api/client';
import type { Session } from '@shared/api/types';

interface SessionValue {
  session: Session | null;
  loading: boolean;
  /** Server-computed permission codes. The UI renders from these, never from a role name. */
  can: (permission: string) => boolean;
  logout: () => void;
}

const Context = createContext<SessionValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['session'],
    // A 401 here is the normal "not signed in" answer, not an error worth retrying.
    queryFn: () => authApi.me().catch(() => null),
    retry: false,
    staleTime: 60_000,
  });

  const logout = useMutation({
    mutationFn: () => authApi.logout(),
    onSettled: () => {
      queryClient.clear();
      window.location.assign('/login');
    },
  });

  const value = useMemo<SessionValue>(() => {
    const session = data ?? null;
    const permissions = new Set(session?.permissions ?? []);
    return {
      session,
      loading: isLoading,
      can: (permission: string) => permissions.has(permission),
      logout: () => logout.mutate(),
    };
  }, [data, isLoading, logout]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(Context);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
