/**
 * The session cookie encodes `${sessionId}.${secret}`. Only the secret's
 * SHA-256 is ever persisted (Session.tokenHash) — see AUTHENTICATION.md §4.
 * Possessing the cookie without a live, matching database row is worthless.
 */
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { config } from "@/server/config";

export function generateSessionSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function encodeCookieValue(sessionId: string, secret: string): string {
  return `${sessionId}.${secret}`;
}

export function decodeCookieValue(
  value: string,
): { sessionId: string; secret: string } | null {
  const separatorIndex = value.indexOf(".");
  if (separatorIndex <= 0) return null;
  const sessionId = value.slice(0, separatorIndex);
  const secret = value.slice(separatorIndex + 1);
  if (!sessionId || !secret) return null;
  return { sessionId, secret };
}

export function secretMatchesHash(
  secret: string,
  storedHashHex: string,
): boolean {
  const computed = Buffer.from(hashSecret(secret), "hex");
  const stored = Buffer.from(storedHashHex, "hex");
  if (computed.length !== stored.length) return false;
  return timingSafeEqual(computed, stored);
}

export const SESSION_COOKIE_NAME = config.SESSION_COOKIE_NAME;

export const sessionCookieAttributes = {
  httpOnly: true,
  secure: config.COOKIE_SECURE,
  sameSite: "lax" as const,
  path: "/",
};
