import { useQuery } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { fetchAuthMethods, fetchHealth } from '@shared/api/systemApi';

/**
 * Phase 0 landing page. It exercises the whole path the architecture describes — SPA to API on the
 * same origin, typed response, query cache, MUI theme — and shows that the sign-in screen can be
 * driven by configuration rather than by an assumption that everyone uses Entra ID
 * (ARCHITECTURE.md 5.5).
 */
export function SystemStatusPage() {
  const health = useQuery({ queryKey: ['system', 'health'], queryFn: fetchHealth });
  const authMethods = useQuery({ queryKey: ['system', 'auth-methods'], queryFn: fetchAuthMethods });

  return (
    <Stack spacing={3}>
      <Typography variant="body1" color="text.secondary">
        Phase 0 — architecture skeleton. Feature slices land per ARCHITECTURE.md section 19.2.
      </Typography>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Backend
          </Typography>
          {health.isPending && <CircularProgress size={20} role="status" aria-label="Checking backend" />}
          {health.isError && (
            <Alert severity="error">Backend unreachable. Start it with `docker compose up`.</Alert>
          )}
          {health.data && (
            <Stack direction="row" spacing={1}>
              <Chip color="success" label={health.data.status} />
              <Chip variant="outlined" label={`v${health.data.version}`} />
            </Stack>
          )}
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Enabled sign-in methods
          </Typography>
          <Stack direction="row" spacing={1}>
            {(authMethods.data?.methods ?? []).map((method) => (
              <Chip
                key={method.id}
                label={method.id}
                color={method.enabled ? 'primary' : 'default'}
                variant={method.enabled ? 'filled' : 'outlined'}
              />
            ))}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
