/**
 * The Assertion Consumer Service — the full validation chain from
 * AUTHENTICATION.md §3: signature (via node-saml), issuer, audience,
 * destination, timestamps and clock skew (via node-saml), InResponseTo
 * (via our signed RelayState — see relay-state.ts), signature algorithm
 * (via signature-check.ts), and replay (via replay-guard.ts). Any failure
 * produces a generic error to the browser and an AUTH_SAML_REJECTED audit
 * row naming the reason — never the assertion body.
 */
import { createSession } from "@/modules/auth/session";
import { writeAudit } from "@/modules/audit";
import type { User } from "@/generated/prisma/client";
import { getSamlClientForAcs } from "./client";
import { verifyRelayState } from "./relay-state";
import { mapProfileAttributes } from "./attribute-mapping";
import { provisionOrLinkUser } from "./provision";
import {
  extractAssertionId,
  extractNotOnOrAfter,
  usesWeakSignatureAlgorithm,
} from "./signature-check";
import { tryConsumeAssertion } from "./replay-guard";
import { SamlDisabledError, SamlRejectedError } from "./errors";
import { config } from "@/server/config";

export interface SamlAcsInput {
  samlResponse: string;
  relayState: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface SamlAcsResult {
  cookieValue: string;
  redirectPath: string;
  user: User;
}

async function auditRejection(
  reason: string,
  input: SamlAcsInput,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await writeAudit({
    action: "AUTH_SAML_REJECTED",
    entityType: "User",
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    metadata: { reason, ...extra },
  });
}

export async function processSamlAcs(
  input: SamlAcsInput,
): Promise<SamlAcsResult> {
  if (!config.AUTH_SAML_ENABLED) {
    throw new SamlDisabledError();
  }

  const relayPayload = verifyRelayState(input.relayState);
  if (!relayPayload) {
    await auditRejection("RELAY_STATE_INVALID", input);
    throw new SamlRejectedError(
      "RELAY_STATE_INVALID",
      "Your sign-in request could not be verified.",
    );
  }

  const saml = getSamlClientForAcs();
  const { profile } = await saml
    .validatePostResponseAsync({ SAMLResponse: input.samlResponse })
    .catch(async (err: unknown) => {
      await auditRejection("VALIDATION_FAILED", input, {
        detail: err instanceof Error ? err.message : String(err),
      });
      throw new SamlRejectedError(
        "VALIDATION_FAILED",
        "Your sign-in could not be verified.",
      );
    });

  if (!profile) {
    await auditRejection("NO_PROFILE", input);
    throw new SamlRejectedError(
      "NO_PROFILE",
      "Your sign-in could not be verified.",
    );
  }

  if (profile.inResponseTo !== relayPayload.rid) {
    await auditRejection("IN_RESPONSE_TO_MISMATCH", input);
    throw new SamlRejectedError(
      "IN_RESPONSE_TO_MISMATCH",
      "This sign-in response does not match a request from this browser.",
    );
  }

  // getAssertionXml() returns the *enveloped-signature-transformed* content
  // node-saml verified the digest against — the Signature element itself
  // has necessarily been stripped out by that transform, so it can never
  // reveal which algorithm signed it. The raw response (already known to
  // contain exactly this one, now cryptographically verified, assertion)
  // still has it.
  const rawResponseXml = profile.getSamlResponseXml?.() ?? "";

  if (usesWeakSignatureAlgorithm(rawResponseXml)) {
    await auditRejection("WEAK_SIGNATURE_ALGORITHM", input);
    throw new SamlRejectedError(
      "WEAK_SIGNATURE_ALGORITHM",
      "Your identity provider used a signature algorithm that is no longer accepted.",
    );
  }

  const assertionId = extractAssertionId(rawResponseXml);
  if (!assertionId) {
    await auditRejection("MISSING_ASSERTION_ID", input);
    throw new SamlRejectedError(
      "MISSING_ASSERTION_ID",
      "Your sign-in could not be verified.",
    );
  }

  const notOnOrAfter =
    extractNotOnOrAfter(rawResponseXml) ?? new Date(Date.now() + 5 * 60_000);
  const fresh = await tryConsumeAssertion(assertionId, notOnOrAfter);
  if (!fresh) {
    await auditRejection("REPLAYED", input, { assertionId });
    throw new SamlRejectedError(
      "REPLAYED",
      "This sign-in response has already been used.",
    );
  }

  let attrs;
  try {
    attrs = mapProfileAttributes(profile);
  } catch (err) {
    await auditRejection("ATTRIBUTE_MAPPING_FAILED", input, {
      detail: err instanceof Error ? err.message : String(err),
    });
    throw new SamlRejectedError(
      "ATTRIBUTE_MAPPING_FAILED",
      "Your sign-in could not be verified.",
    );
  }

  let user: User;
  try {
    user = await provisionOrLinkUser(attrs);
  } catch (err) {
    if (err instanceof SamlRejectedError) {
      await auditRejection(err.reason, input, { email: attrs.email });
      throw err;
    }
    throw err;
  }

  const { cookieValue } = await createSession({
    userId: user.id,
    authProvider: "ENTRA_ID",
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    samlSessionIndex: profile.sessionIndex,
  });

  await writeAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "AUTH_SAML_SUCCESS",
    entityType: "User",
    entityId: user.id,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  return { cookieValue, redirectPath: relayPayload.path, user };
}
