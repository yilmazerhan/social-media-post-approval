import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { config } from "@/server/config";
import { processSamlAcs, SamlRejectedError } from "@/modules/auth/saml";
// Reaching into the module's internals (not its index.ts surface) is
// deliberate here: these tests need to mint the exact signed RelayState
// the real login redirect would produce, without going through an HTTP
// redirect round-trip — see ARCHITECTURE.md §2 for the normal boundary.
import { createRelayState } from "@/modules/auth/saml/relay-state";
import {
  buildSignedSamlResponse,
  tamperSignedResponse,
  uniqueId,
} from "../fixtures/saml/build-response";

/**
 * Exercises the full ACS validation chain (AUTHENTICATION.md §3) against
 * a fake Entra ID response signed with tests/fixtures/saml/idp-key.pem —
 * proving every documented rejection reason actually fires, plus the
 * happy path. See .env.test for the matching SAML_* configuration.
 *
 * NO_PROFILE and MISSING_ASSERTION_ID are defense-in-depth branches this
 * suite cannot reach end-to-end: reading @node-saml/node-saml's source
 * shows validatePostResponseAsync only returns a null profile for an
 * IdP-initiated NoPassive status (not producible by a real SSO response),
 * and a validly-signed assertion always carries the ID attribute our own
 * signing step just referenced. Both are covered as direct unit tests of
 * their extraction helpers in tests/unit/signature-check.test.ts instead.
 */

const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

function validRelayState(rid: string, path = "/dashboard") {
  return createRelayState(rid, path);
}

describe("processSamlAcs — happy path", () => {
  it("provisions a new user and creates a session on a valid response", async () => {
    const rid = uniqueId();
    const objectId = randomUUID();
    const email = `saml-${randomUUID()}@authtest.local`;

    const samlResponse = buildSignedSamlResponse({
      inResponseTo: rid,
      nameId: objectId,
      attributes: {
        "http://schemas.microsoft.com/identity/claims/objectidentifier":
          objectId,
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress":
          email,
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname":
          "Test",
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname": "User",
      },
    });

    const result = await processSamlAcs({
      samlResponse,
      relayState: validRelayState(rid),
    });
    createdUserIds.push(result.user.id);

    expect(result.user.email).toBe(email);
    expect(result.user.authProvider).toBe("ENTRA_ID");
    expect(result.redirectPath).toBe("/dashboard");
    expect(result.cookieValue).toBeTruthy();

    const roles = await prisma.userRole.findMany({
      where: { userId: result.user.id },
      include: { role: true },
    });
    expect(roles.map((r) => r.role.key)).toContain(
      config.SAML_JIT_DEFAULT_ROLE,
    );
  });
});

describe("processSamlAcs — rejection paths", () => {
  it("rejects a garbled RelayState as RELAY_STATE_INVALID", async () => {
    const rid = uniqueId();
    const samlResponse = buildSignedSamlResponse({
      inResponseTo: rid,
      nameId: randomUUID(),
    });

    await expect(
      processSamlAcs({ samlResponse, relayState: "not-a-real-relay-state" }),
    ).rejects.toMatchObject({ reason: "RELAY_STATE_INVALID" });
  });

  it("rejects a RelayState whose rid doesn't match the response's InResponseTo", async () => {
    const responseRid = uniqueId();
    const otherRid = uniqueId();
    const samlResponse = buildSignedSamlResponse({
      inResponseTo: responseRid,
      nameId: randomUUID(),
    });

    await expect(
      processSamlAcs({
        samlResponse,
        relayState: validRelayState(otherRid),
      }),
    ).rejects.toMatchObject({ reason: "IN_RESPONSE_TO_MISMATCH" });
  });

  it("rejects a tampered assertion (broken signature) as VALIDATION_FAILED", async () => {
    const rid = uniqueId();
    const nameId = randomUUID();
    const samlResponse = buildSignedSamlResponse({
      inResponseTo: rid,
      nameId,
    });
    const tampered = tamperSignedResponse(samlResponse, nameId, randomUUID());

    await expect(
      processSamlAcs({
        samlResponse: tampered,
        relayState: validRelayState(rid),
      }),
    ).rejects.toMatchObject({ reason: "VALIDATION_FAILED" });
  });

  it("rejects an expired assertion as VALIDATION_FAILED", async () => {
    const rid = uniqueId();
    const samlResponse = buildSignedSamlResponse({
      inResponseTo: rid,
      nameId: randomUUID(),
      notBefore: new Date(Date.now() - 20 * 60_000),
      notOnOrAfter: new Date(Date.now() - 10 * 60_000),
    });

    await expect(
      processSamlAcs({ samlResponse, relayState: validRelayState(rid) }),
    ).rejects.toMatchObject({ reason: "VALIDATION_FAILED" });
  });

  it("rejects a response with the wrong audience as VALIDATION_FAILED", async () => {
    const rid = uniqueId();
    const samlResponse = buildSignedSamlResponse({
      inResponseTo: rid,
      nameId: randomUUID(),
      audience: "https://not-our-sp.example",
    });

    await expect(
      processSamlAcs({ samlResponse, relayState: validRelayState(rid) }),
    ).rejects.toMatchObject({ reason: "VALIDATION_FAILED" });
  });

  it("rejects an unsigned assertion as VALIDATION_FAILED", async () => {
    const rid = uniqueId();
    const samlResponse = buildSignedSamlResponse({
      inResponseTo: rid,
      nameId: randomUUID(),
      omitSignature: true,
    });

    await expect(
      processSamlAcs({ samlResponse, relayState: validRelayState(rid) }),
    ).rejects.toMatchObject({ reason: "VALIDATION_FAILED" });
  });

  it("rejects a SHA-1-signed assertion as WEAK_SIGNATURE_ALGORITHM", async () => {
    const rid = uniqueId();
    const samlResponse = buildSignedSamlResponse({
      inResponseTo: rid,
      nameId: randomUUID(),
      signatureAlgorithm: "sha1",
    });

    await expect(
      processSamlAcs({ samlResponse, relayState: validRelayState(rid) }),
    ).rejects.toMatchObject({ reason: "WEAK_SIGNATURE_ALGORITHM" });
  });

  it("rejects a replayed assertion the second time it's presented", async () => {
    const rid = uniqueId();
    const objectId = randomUUID();
    const samlResponse = buildSignedSamlResponse({
      inResponseTo: rid,
      nameId: objectId,
      attributes: {
        "http://schemas.microsoft.com/identity/claims/objectidentifier":
          objectId,
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress": `saml-${randomUUID()}@authtest.local`,
      },
    });

    const first = await processSamlAcs({
      samlResponse,
      relayState: validRelayState(rid),
    });
    createdUserIds.push(first.user.id);

    await expect(
      processSamlAcs({ samlResponse, relayState: validRelayState(rid) }),
    ).rejects.toMatchObject({ reason: "REPLAYED" });
  });

  it("rejects a response with no usable NameID or attributes as ATTRIBUTE_MAPPING_FAILED", async () => {
    const rid = uniqueId();
    const samlResponse = buildSignedSamlResponse({
      inResponseTo: rid,
      nameId: "",
    });

    await expect(
      processSamlAcs({ samlResponse, relayState: validRelayState(rid) }),
    ).rejects.toMatchObject({ reason: "ATTRIBUTE_MAPPING_FAILED" });
  });

  it("rejects sign-in for a disabled ENTRA_ID account as ACCOUNT_INACTIVE", async () => {
    const objectId = randomUUID();
    const disabledUser = await prisma.user.create({
      data: {
        email: `saml-disabled-${randomUUID()}@authtest.local`,
        displayName: "Disabled SAML User",
        firstName: "Disabled",
        lastName: "User",
        authProvider: "ENTRA_ID",
        externalIdentityId: objectId,
        status: "DISABLED",
      },
    });
    createdUserIds.push(disabledUser.id);

    const rid = uniqueId();
    const samlResponse = buildSignedSamlResponse({
      inResponseTo: rid,
      nameId: objectId,
      attributes: {
        "http://schemas.microsoft.com/identity/claims/objectidentifier":
          objectId,
      },
    });

    await expect(
      processSamlAcs({ samlResponse, relayState: validRelayState(rid) }),
    ).rejects.toMatchObject({ reason: "ACCOUNT_INACTIVE" });
  });

  it("rejects linking to an existing LOCAL account as LOCAL_LINK_FORBIDDEN", async () => {
    const email = `saml-local-${randomUUID()}@authtest.local`;
    const localUser = await prisma.user.create({
      data: {
        email,
        displayName: "Local User",
        firstName: "Local",
        lastName: "User",
        authProvider: "LOCAL",
        passwordHash: "argon2id$fake$hash$for$testing",
      },
    });
    createdUserIds.push(localUser.id);

    const rid = uniqueId();
    const samlResponse = buildSignedSamlResponse({
      inResponseTo: rid,
      nameId: randomUUID(),
      attributes: {
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress":
          email,
      },
    });

    expect(config.SAML_ALLOW_LOCAL_LINK).toBe(false);
    await expect(
      processSamlAcs({ samlResponse, relayState: validRelayState(rid) }),
    ).rejects.toMatchObject({ reason: "LOCAL_LINK_FORBIDDEN" });
  });

  it("rejects a brand-new identity as NO_ACCOUNT_PROVISIONED when JIT is off", async () => {
    const original = config.SAML_JIT_PROVISIONING;
    config.SAML_JIT_PROVISIONING = false;
    try {
      const rid = uniqueId();
      const email = `saml-no-jit-${randomUUID()}@authtest.local`;
      const samlResponse = buildSignedSamlResponse({
        inResponseTo: rid,
        nameId: randomUUID(),
        attributes: {
          "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress":
            email,
        },
      });

      await expect(
        processSamlAcs({ samlResponse, relayState: validRelayState(rid) }),
      ).rejects.toMatchObject({ reason: "NO_ACCOUNT_PROVISIONED" });

      const user = await prisma.user.findUnique({ where: { email } });
      expect(user).toBeNull();
    } finally {
      config.SAML_JIT_PROVISIONING = original;
    }
  });

  it("surfaces rejections as SamlRejectedError instances", async () => {
    const rid = uniqueId();
    const samlResponse = buildSignedSamlResponse({
      inResponseTo: rid,
      nameId: "",
    });

    await expect(
      processSamlAcs({ samlResponse, relayState: validRelayState(rid) }),
    ).rejects.toBeInstanceOf(SamlRejectedError);
  });
});
