/**
 * Identity resolution and JIT provisioning — AUTHENTICATION.md §3.
 *
 * Group→role mapping (an administrator-managed table per AUTHENTICATION.md
 * §3) is deferred to Phase 5/21 alongside the rest of RBAC administration;
 * for now JIT provisioning grants exactly one role, `SAML_JIT_DEFAULT_ROLE`.
 * Department is not auto-linked from the SAML attribute — resolving a free-
 * text claim to a `Department` row needs an explicit mapping this phase
 * doesn't define; department stays admin-assignable.
 */
import { prisma } from "@/server/db";
import { config } from "@/server/config";
import type { User } from "@/generated/prisma/client";
import type { MappedSamlAttributes } from "./attribute-mapping";
import { SamlRejectedError } from "./errors";

function profileUpdateData(attrs: MappedSamlAttributes) {
  return {
    displayName: attrs.displayName,
    firstName: attrs.firstName,
    lastName: attrs.lastName,
    jobTitle: attrs.jobTitle,
  };
}

function assertActive(user: User): void {
  if (user.status !== "ACTIVE" || user.deletedAt) {
    throw new SamlRejectedError(
      "ACCOUNT_INACTIVE",
      "This account is not active.",
    );
  }
}

async function grantDefaultRole(userId: string): Promise<void> {
  const role = await prisma.role.findUnique({
    where: { key: config.SAML_JIT_DEFAULT_ROLE },
  });
  if (!role) return;
  if (config.SAML_JIT_FORBID_ADMIN && role.key === "ADMIN") return;

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    create: { userId, roleId: role.id },
    update: {},
  });
}

export async function provisionOrLinkUser(
  attrs: MappedSamlAttributes,
): Promise<User> {
  const byExternalId = await prisma.user.findFirst({
    where: {
      authProvider: "ENTRA_ID",
      externalIdentityId: attrs.externalIdentityId,
    },
  });
  if (byExternalId) {
    assertActive(byExternalId);
    return prisma.user.update({
      where: { id: byExternalId.id },
      data: profileUpdateData(attrs),
    });
  }

  const byEmail = await prisma.user.findUnique({
    where: { email: attrs.email },
  });
  if (byEmail) {
    if (byEmail.authProvider === "ENTRA_ID") {
      assertActive(byEmail);
      return prisma.user.update({
        where: { id: byEmail.id },
        data: {
          externalIdentityId: attrs.externalIdentityId,
          ...profileUpdateData(attrs),
        },
      });
    }

    if (!config.SAML_ALLOW_LOCAL_LINK) {
      throw new SamlRejectedError(
        "LOCAL_LINK_FORBIDDEN",
        "An account with this email already exists as a local account.",
      );
    }
    assertActive(byEmail);
    return prisma.user.update({
      where: { id: byEmail.id },
      data: {
        authProvider: "ENTRA_ID",
        externalIdentityId: attrs.externalIdentityId,
        passwordHash: null,
        ...profileUpdateData(attrs),
      },
    });
  }

  if (!config.SAML_JIT_PROVISIONING) {
    throw new SamlRejectedError(
      "NO_ACCOUNT_PROVISIONED",
      "No account has been provisioned for this identity.",
    );
  }

  const user = await prisma.user.create({
    data: {
      email: attrs.email,
      displayName:
        attrs.displayName ??
        (`${attrs.firstName ?? ""} ${attrs.lastName ?? ""}`.trim() ||
          attrs.email),
      firstName: attrs.firstName ?? attrs.email,
      lastName: attrs.lastName ?? "",
      jobTitle: attrs.jobTitle,
      authProvider: "ENTRA_ID",
      externalIdentityId: attrs.externalIdentityId,
      status: "ACTIVE",
    },
  });

  await grantDefaultRole(user.id);

  return user;
}
