/**
 * Argon2id password hashing — AUTHENTICATION.md §2, ADR-004.
 *
 * Public surface of this piece of the auth module. Parameters come from
 * configuration so they can be raised later without a code change;
 * `needsRehash` lets a login flow transparently upgrade an old hash.
 */
import { hash, verify, parseOptions } from "@node-rs/argon2";
import { config } from "@/server/config";

// @node-rs/argon2 declares `Algorithm` as a const enum, which `isolatedModules`
// (required by Next.js's per-file compiler) won't let us import — so the
// value it resolves to (Argon2id) is inlined directly instead.
const ARGON2ID = 2;

function currentOptions() {
  return {
    algorithm: ARGON2ID,
    memoryCost: config.ARGON2_MEMORY_KIB,
    timeCost: config.ARGON2_TIME_COST,
    parallelism: config.ARGON2_PARALLELISM,
  };
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, currentOptions());
}

export async function verifyPassword(
  encodedHash: string,
  password: string,
): Promise<boolean> {
  return verify(encodedHash, password);
}

export function needsRehash(encodedHash: string): boolean {
  const current = currentOptions();
  const used = parseOptions(encodedHash);
  return (
    used.algorithm !== current.algorithm ||
    used.memoryCost !== current.memoryCost ||
    used.timeCost !== current.timeCost ||
    used.parallelism !== current.parallelism
  );
}
