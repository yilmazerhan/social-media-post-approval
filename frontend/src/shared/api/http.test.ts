import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch } from '@shared/api/http';

/**
 * The wrapper is the single place where transport concerns live, so its error contract is worth
 * pinning down: an RFC 9457 body must survive intact, and a non-JSON failure must still surface as
 * an ApiError rather than an unhandled parse error.
 */
describe('apiFetch', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the parsed body on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'UP' }), { status: 200 })),
    );

    await expect(apiFetch<{ status: string }>('/system/health')).resolves.toEqual({ status: 'UP' });
  });

  it('surfaces a problem+json body as an ApiError', async () => {
    const problem = { status: 409, code: 'POST_INVALID_TRANSITION', detail: 'Not allowed.' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(problem), { status: 409 })));

    await expect(apiFetch('/posts/1/submit', { method: 'POST' })).rejects.toMatchObject({
      name: 'ApiError',
      problem: { code: 'POST_INVALID_TRANSITION', status: 409 },
    });
  });

  it('still throws an ApiError when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>502</html>', { status: 502 })));

    await expect(apiFetch('/posts')).rejects.toBeInstanceOf(ApiError);
  });
});
