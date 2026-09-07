import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { config } from "@/server/config";
import {
  ProviderMismatchError,
  PasswordPolicyError,
} from "@/server/http/handler";
import {
  createUser,
  updateUser,
  setUserEnabled,
  assignRole,
  removeRole,
  adminResetPassword,
  listUserSessions,
  revokeAllSessionsForUser,
  listRoles,
  updateRolePermissions,
  createRole,
  listGroups,
  createGroup,
  updateGroup,
  addGroupMember,
  removeGroupMember,
  listGroupMembers,
  listDepartments,
  createDepartment,
  updateDepartment,
} from "@/modules/administration";
import {
  generateSessionSecret,
  hashSecret,
} from "@/modules/auth/session/cookie";

/**
 * Phase 21 — administration. Exit criterion (IMPLEMENTATION_PLAN.md): an
 * administrator can run the system without touching the database; Entra
 * users show no password affordance anywhere.
 */

const createdUserIds: string[] = [];
const createdDepartmentIds: string[] = [];
const createdGroupIds: string[] = [];
const createdRoleIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  if (createdGroupIds.length) {
    await prisma.group.deleteMany({ where: { id: { in: createdGroupIds } } });
  }
  if (createdRoleIds.length) {
    await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
  }
  if (createdDepartmentIds.length) {
    await prisma.department.deleteMany({
      where: { id: { in: createdDepartmentIds } },
    });
  }
  await prisma.$disconnect();
});

async function createActor(displayName: string) {
  const user = await prisma.user.create({
    data: {
      email: `admin-actor-${randomUUID()}@editortest.local`,
      displayName,
      firstName: displayName,
      lastName: "Test",
      authProvider: "LOCAL",
      passwordHash: "argon2id$fake$hash$for$testing",
    },
  });
  createdUserIds.push(user.id);
  return user;
}

describe("Users", () => {
  it("creates a PENDING LOCAL user, queues a reset email, and no password affordance applies to an Entra user", async () => {
    const actor = await createActor("Admin Actor Users");
    const created = await createUser(
      {
        email: `new-hire-${randomUUID()}@editortest.local`,
        displayName: "New Hire",
        firstName: "New",
        lastName: "Hire",
        roleKeys: ["EMPLOYEE"],
      },
      actor.id,
    );
    createdUserIds.push(created.id);
    expect(created.status).toBe("PENDING");
    expect(created.authProvider).toBe("LOCAL");
    expect(created.roleKeys).toContain("EMPLOYEE");

    const log = await prisma.emailLog.findFirst({
      where: { templateKey: "password_reset", toAddress: created.email },
    });
    expect(log).not.toBeNull();

    const entraUser = await prisma.user.create({
      data: {
        email: `entra-${randomUUID()}@editortest.local`,
        displayName: "Entra User",
        firstName: "Entra",
        lastName: "User",
        authProvider: "ENTRA_ID",
        externalIdentityId: randomUUID(),
      },
    });
    createdUserIds.push(entraUser.id);
    await expect(
      adminResetPassword(entraUser.id, "Sup3rS3cur3Pass!!", actor.id),
    ).rejects.toBeInstanceOf(ProviderMismatchError);
  });

  it("disabling a user revokes every active session; enabling restores nothing but the status", async () => {
    const actor = await createActor("Admin Actor Disable");
    const target = await createActor("Disable Target");
    const session = await prisma.session.create({
      data: {
        userId: target.id,
        tokenHash: hashSecret(generateSessionSecret()),
        authProvider: "LOCAL",
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });

    await setUserEnabled(target.id, false, actor.id);
    const revoked = await prisma.session.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(revoked.revokedAt).not.toBeNull();
    expect(revoked.revokedReason).toBe("USER_DISABLED");

    const disabled = await prisma.user.findUniqueOrThrow({
      where: { id: target.id },
    });
    expect(disabled.status).toBe("DISABLED");

    const reEnabled = await setUserEnabled(target.id, true, actor.id);
    expect(reEnabled.status).toBe("ACTIVE");
  });

  it("assigns and removes a role", async () => {
    const actor = await createActor("Admin Actor Roles");
    const target = await createActor("Role Target");

    const assigned = await assignRole(target.id, "APPROVER", actor.id);
    expect(assigned.roleKeys).toContain("APPROVER");

    const removed = await removeRole(target.id, "APPROVER", actor.id);
    expect(removed.roleKeys).not.toContain("APPROVER");
  });

  it("revokes active sessions on a role change when SESSION_REVOKE_ON_ROLE_CHANGE is set — SECURITY.md's session-fixation control", async () => {
    const actor = await createActor("Admin Actor Role Revoke");
    const target = await createActor("Role Revoke Target");
    const session = await prisma.session.create({
      data: {
        userId: target.id,
        tokenHash: hashSecret(generateSessionSecret()),
        authProvider: "LOCAL",
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });

    const original = config.SESSION_REVOKE_ON_ROLE_CHANGE;
    config.SESSION_REVOKE_ON_ROLE_CHANGE = true;
    try {
      await assignRole(target.id, "APPROVER", actor.id);
    } finally {
      config.SESSION_REVOKE_ON_ROLE_CHANGE = original;
    }

    const revoked = await prisma.session.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(revoked.revokedAt).not.toBeNull();
    expect(revoked.revokedReason).toBe("ROLE_CHANGED");
  });

  it("leaves sessions alone on a role change when SESSION_REVOKE_ON_ROLE_CHANGE is unset (the default)", async () => {
    const actor = await createActor("Admin Actor Role No-Revoke");
    const target = await createActor("Role No-Revoke Target");
    const session = await prisma.session.create({
      data: {
        userId: target.id,
        tokenHash: hashSecret(generateSessionSecret()),
        authProvider: "LOCAL",
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });

    expect(config.SESSION_REVOKE_ON_ROLE_CHANGE).toBe(false);
    await assignRole(target.id, "APPROVER", actor.id);

    const stillActive = await prisma.session.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(stillActive.revokedAt).toBeNull();
  });

  it("resets a LOCAL user's password directly, forces a change, and revokes sessions", async () => {
    const actor = await createActor("Admin Actor Reset");
    const target = await createActor("Reset Target");
    await prisma.session.create({
      data: {
        userId: target.id,
        tokenHash: hashSecret(generateSessionSecret()),
        authProvider: "LOCAL",
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });

    await expect(
      adminResetPassword(target.id, "short", actor.id),
    ).rejects.toBeInstanceOf(PasswordPolicyError);

    await adminResetPassword(target.id, "Sup3rS3cur3Pass!!", actor.id);
    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: target.id },
    });
    expect(updated.mustChangePassword).toBe(true);
    expect(updated.passwordHash).not.toBeNull();

    const sessions = await listUserSessions(target.id);
    expect(sessions).toHaveLength(0);
  });

  it("lists and revokes sessions for a user via the admin surface", async () => {
    const actor = await createActor("Admin Actor Sessions");
    const target = await createActor("Sessions Target");
    await prisma.session.create({
      data: {
        userId: target.id,
        tokenHash: hashSecret(generateSessionSecret()),
        authProvider: "LOCAL",
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });

    expect(await listUserSessions(target.id)).toHaveLength(1);
    await revokeAllSessionsForUser(target.id, actor.id);
    expect(await listUserSessions(target.id)).toHaveLength(0);
  });

  it("updateUser edits department/jobTitle", async () => {
    const actor = await createActor("Admin Actor Update");
    const target = await createActor("Update Target");
    const updated = await updateUser(
      target.id,
      { jobTitle: "Senior Tester" },
      actor.id,
    );
    expect(updated.jobTitle).toBe("Senior Tester");
  });
});

describe("Roles and permissions", () => {
  it("lists seeded roles with their permission grants", async () => {
    const roles = await listRoles();
    const admin = roles.find((r) => r.key === "ADMIN");
    if (!admin) throw new Error("expected the seeded ADMIN role to exist");
    expect(admin.isSystem).toBe(true);
    expect(admin.permissionKeys.length).toBeGreaterThan(0);
  });

  it("creates a custom role and edits its permission grants", async () => {
    const actor = await createActor("Admin Actor Role Create");
    const created = await createRole(
      {
        key: `CUSTOM_${randomUUID().slice(0, 8).toUpperCase()}`,
        name: "Custom Role",
        permissionKeys: ["POST_READ_OWN"],
      },
      actor.id,
    );
    createdRoleIds.push(created.id);
    expect(created.isSystem).toBe(false);
    expect(created.permissionKeys).toEqual(["POST_READ_OWN"]);

    const updated = await updateRolePermissions(
      created.id,
      ["POST_READ_OWN", "POST_CREATE"],
      actor.id,
    );
    expect(updated.permissionKeys.sort()).toEqual(
      ["POST_CREATE", "POST_READ_OWN"].sort(),
    );
  });
});

describe("Groups", () => {
  it("creates a group, adds and removes a member", async () => {
    const actor = await createActor("Admin Actor Groups");
    const member = await createActor("Group Member");

    const group = await createGroup(
      {
        key: `admin-group-${randomUUID()}`,
        name: "Admin Test Group",
        isApprovalGroup: true,
        isActive: true,
      },
      actor.id,
    );
    createdGroupIds.push(group.id);
    expect(group.memberCount).toBe(0);

    await addGroupMember(group.id, member.id, actor.id);
    const members = await listGroupMembers(group.id);
    expect(members.map((m) => m.userId)).toContain(member.id);

    await removeGroupMember(group.id, member.id, actor.id);
    expect(await listGroupMembers(group.id)).toHaveLength(0);

    const updated = await updateGroup(group.id, { isActive: false }, actor.id);
    expect(updated.isActive).toBe(false);

    const all = await listGroups();
    expect(all.map((g) => g.id)).toContain(group.id);
  });
});

describe("Departments", () => {
  it("creates and updates a department", async () => {
    const actor = await createActor("Admin Actor Departments");
    const manager = await createActor("Department Manager");

    const department = await createDepartment(
      {
        key: `admin-dept-${randomUUID()}`,
        name: "Admin Test Dept",
        isActive: true,
      },
      actor.id,
    );
    createdDepartmentIds.push(department.id);
    expect(department.managerId).toBeNull();

    const updated = await updateDepartment(
      department.id,
      { managerId: manager.id },
      actor.id,
    );
    expect(updated.managerId).toBe(manager.id);
    expect(updated.managerName).toBe(manager.displayName);

    const all = await listDepartments();
    expect(all.map((d) => d.id)).toContain(department.id);
  });
});
