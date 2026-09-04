import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '@app/AppLayout';
import { SystemStatusPage } from '@app/SystemStatusPage';

/**
 * Route table. Feature routes are added here as lazy-loaded slices, each guarded by the permission
 * its screen needs (ARCHITECTURE.md 2.4).
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <AppLayout>
        <SystemStatusPage />
      </AppLayout>
    ),
  },
]);
