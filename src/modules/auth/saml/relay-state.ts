/**
 * A signed, stateless replacement for node-saml's InResponseTo cache
 * (see config.ts for why). Carries the AuthnRequest ID we generated and
 * the internal path to return the user to; both are verified on the way
 * back. `path` is restricted to a single leading slash — never `//...`
 * or an absolute URL — so RelayState can never become an open redirect
 * (SECURITY.md §2).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "@/server/config";

const MAX_AGE_MS = 10 * 60 * 1000;

interface RelayStatePayload {
  rid: string;
  path: string;
  iat: number;
}

function sign(json: string): string {
  return createHmac("sha256", config.SESSION_SECRET)
    .update(json)
    .digest("base64url");
}

export function createRelayState(
  requestId: string,
  redirectPath: string,
): string {
  const path =
    redirectPath.startsWith("/") && !redirectPath.startsWith("//")
      ? redirectPath
      : "/";
  const payload: RelayStatePayload = { rid: requestId, path, iat: Date.now() };
  const json = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${json}.${sign(json)}`;
}

export function verifyRelayState(relayState: string): RelayStatePayload | null {
  const separatorIndex = relayState.lastIndexOf(".");
  if (separatorIndex <= 0) return null;

  const json = relayState.slice(0, separatorIndex);
  const signature = relayState.slice(separatorIndex + 1);
  const expected = sign(json);

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (
    sigBuf.length !== expectedBuf.length ||
    !timingSafeEqual(sigBuf, expectedBuf)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(json, "base64url").toString("utf8"),
    ) as RelayStatePayload;
    if (
      typeof payload.rid !== "string" ||
      typeof payload.path !== "string" ||
      typeof payload.iat !== "number"
    ) {
      return null;
    }
    if (Date.now() - payload.iat > MAX_AGE_MS) return null;
    if (!payload.path.startsWith("/") || payload.path.startsWith("//"))
      return null;
    return payload;
  } catch {
    return null;
  }
}
