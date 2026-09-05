import { Navigate, useLocation } from 'react-router-dom';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import type { ReactNode } from 'react';
import { useSession } from '@shared/session/SessionContext';
import { EmptyState } from '@shared/components/EmptyState';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';

/**
 * Route guard. It hides what a user may not reach, which is a courtesy — the server refuses the
 * same requests regardless, and that is the control.
 */
export function RequireAuth({ children, permission }: { children: ReactNode; permission?: string }) {
  const { session, loading, can } = useSession();
  const location = useLocation();

  if (loading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <CircularProgress aria-label="Loading" />
      </Box>
    );
  }
  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  if (permission && !can(permission)) {
    return (
      <EmptyState
        icon={<LockOutlinedIcon />}
        title="You do not have access to this screen"
        description="Your role does not include this permission. An administrator can grant it if you need it."
      />
    );
  }
  return <>{children}</>;
}
