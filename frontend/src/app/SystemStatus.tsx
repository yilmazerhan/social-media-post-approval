import { useQuery } from '@tanstack/react-query';
import { fetchAuthMethods, fetchHealth } from '@shared/api/systemApi';

/**
 * Validates the full path the architecture describes: SPA to API over the same origin, typed
 * response, TanStack Query cache. It also proves the login screen can render itself from
 * configuration rather than from a hard-coded assumption about Entra ID (ARCHITECTURE.md 5.5).
 */
export function SystemStatus() {
  const health = useQuery({ queryKey: ['system', 'health'], queryFn: fetchHealth });
  const authMethods = useQuery({ queryKey: ['system', 'auth-methods'], queryFn: fetchAuthMethods });

  if (health.isPending) {
    return <p role="status">Checking backend…</p>;
  }

  if (health.isError) {
    return <p role="alert">Backend unreachable. Start it with `docker compose up`.</p>;
  }

  return (
    <section>
      <h2>Backend</h2>
      <dl>
        <dt>Status</dt>
        <dd>{health.data.status}</dd>
        <dt>Version</dt>
        <dd>{health.data.version}</dd>
      </dl>
      <h2>Enabled sign-in methods</h2>
      <ul>
        {(authMethods.data?.methods ?? []).map((method) => (
          <li key={method.id}>
            {method.id}: {method.enabled ? 'enabled' : 'disabled'}
          </li>
        ))}
      </ul>
    </section>
  );
}
