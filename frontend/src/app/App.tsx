import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SystemStatus } from '@app/SystemStatus';

// Server state lives in TanStack Query, URL state in the router, local UI state in components.
// Three kinds of state, three mechanisms, no overlap (ARCHITECTURE.md 2.2).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <main className="app-shell">
        <h1>Kron Social Approval</h1>
        <p className="subtitle">
          Phase 0 — architecture skeleton. Feature slices land per ARCHITECTURE.md section 19.2.
        </p>
        <SystemStatus />
      </main>
    </QueryClientProvider>
  );
}
