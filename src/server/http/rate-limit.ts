/**
 * In-process sliding-window rate limiting for the non-auth classes
 * (mutation/read/export) — API.md §4. The auth class is durable
 * (PostgreSQL-backed, via LoginAttempt) because it must survive a
 * process restart and be shared across replicas; see
 * modules/auth/local/login.ts.
 */
const windows = new Map<string, number[]>();

/** Returns true when the request is allowed; false when the caller has hit the limit. */
export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const timestamps = (windows.get(key) ?? []).filter((t) => t > cutoff);

  if (timestamps.length >= max) {
    windows.set(key, timestamps);
    return false;
  }

  timestamps.push(now);
  windows.set(key, timestamps);
  return true;
}
