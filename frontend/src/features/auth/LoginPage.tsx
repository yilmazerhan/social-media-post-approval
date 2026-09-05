import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import WindowIcon from '@mui/icons-material/Window';
import { authApi } from '@shared/api/client';
import { ApiError } from '@shared/api/http';

/**
 * One screen, two front doors.
 *
 * <p>Which are offered comes from the server, so the same build serves an Entra-only deployment, a
 * local-only one, or both. Nothing here assumes every user comes from the directory.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const methods = useQuery({ queryKey: ['auth', 'methods'], queryFn: authApi.methods, retry: false });

  const login = useMutation({
    mutationFn: () => authApi.login(username, password),
    onSuccess: async (session) => {
      queryClient.setQueryData(['session'], session);
      await queryClient.invalidateQueries();
      navigate('/', { replace: true });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate();
  };

  const error = login.error instanceof ApiError ? login.error.problem : null;

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <Card variant="outlined" sx={{ width: '100%', maxWidth: 420 }}>
        <CardContent sx={{ p: 4 }}>
          <Stack spacing={0.5} sx={{ mb: 3 }}>
            <Typography sx={{ fontWeight: 700 }} variant="h5" component="h1">
              Kron Social Approval
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Corporate content approval and governance
            </Typography>
          </Stack>

          {methods.data?.samlEnabled && (
            <>
              <Button
                fullWidth
                size="large"
                variant="contained"
                startIcon={<WindowIcon />}
                href={methods.data.samlLoginUrl}
              >
                Sign in with Microsoft Entra ID
              </Button>
              {methods.data.localEnabled && (
                <Divider sx={{ my: 3 }}>
                  <Typography variant="caption" color="text.secondary">
                    or sign in with a local account
                  </Typography>
                </Divider>
              )}
            </>
          )}

          {(methods.data?.localEnabled ?? true) && (
            <Box component="form" onSubmit={submit} noValidate>
              <Stack spacing={2}>
                {error && (
                  <Alert severity={error.status === 423 ? 'warning' : 'error'} role="alert">
                    {error.detail ?? 'Sign-in failed.'}
                  </Alert>
                )}
                <TextField
                  label="Username or email"
                  size="medium"
                  autoComplete="username"
                  autoFocus
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
                <TextField
                  label="Password"
                  size="medium"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <Button
                  type="submit"
                  size="large"
                  variant={methods.data?.samlEnabled ? 'outlined' : 'contained'}
                  disabled={login.isPending || !username || !password}
                >
                  {login.isPending ? 'Signing in…' : 'Sign in'}
                </Button>
              </Stack>
            </Box>
          )}

          {methods.data && !methods.data.localEnabled && !methods.data.samlEnabled && (
            <Alert severity="error">No sign-in method is enabled for this environment.</Alert>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
