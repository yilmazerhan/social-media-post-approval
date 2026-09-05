import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { RouterProvider } from 'react-router-dom';
import { theme } from '@shared/theme/theme';
import { router } from '@app/router';
import { SessionProvider } from '@shared/session/SessionContext';

// Server state lives in TanStack Query, URL state in the router, local UI state in components:
// three kinds of state, three mechanisms, no overlap (ARCHITECTURE.md 2.2).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme} defaultMode="system">
        <CssBaseline />
        <SessionProvider>
          <RouterProvider router={router} />
        </SessionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
