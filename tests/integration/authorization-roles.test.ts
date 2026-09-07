import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import {
  bootstrapSystemData,
  ROLES,
} from "../../prisma/lib/bootstrap-system-data";
import {
  loadAuthorizedUser,
  type PermissionKey,
} from "@/modules/authorization";

/**
 * Proves the *seeded* database matches AUTHENTICATION.md §5's default-grants
 * table — not just the ROLES constant tests/unit/authorization.test.ts
 * checks in isolation, but the actual RolePermission rows a fresh
 * bootstrap produces, plus loadAuthorizedUser's real query path. Bootstrap
 * upserts are additive only (they never revoke a grant ROLES stops
 * listing), so this is also the test that would catch that kind of drift.
 */

const createdUserIds: string[] = [];
const createdGroupIds: string[] = [];
const createdDepartmentIds: string[] = [];

beforeAll(async () => {
  await bootstrapSystemData(prisma);
});

afterAll(async () => {
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  if (createdGroupIds.length) {
    await prisma.group.deleteMany({ where: { id: { in: createdGroupIds } } });
  }
  if (createdDepartmentIds.length) {
    await prisma.department.deleteMany({
      where: { id: { in: createdDepartmentIds } },
    });
  }
  await prisma.$disconnect();
});

async function seededRoleGrants(key: string): Promise<Set<PermissionKey>> {
  const rows = await prisma.rolePermission.findMany({
    where: { role: { key } },
    select: { permission: { select: { key: true } } },
  });
  return new Set(rows.map((r) => r.permission.key as PermissionKey));
}

describe("seeded role grants", () => {
  it.each(["EMPLOYEE", "APPROVER", "ADMIN"] as const)(
    "%s's RolePermission rows exactly match ROLES's definition",
    async (key) => {
      const expected = new Set(
        ROLES.find((r) => r.key === key)?.permissions ?? [],
      );
      const actual = await seededRoleGrants(key);
      expect(actual).toEqual(expected);
    },
  );

  it("ADMIN holds every catalogued permission", async () => {
    const actual = await seededRoleGrants("ADMIN");
    const allPermissions = await prisma.permission.count();
    expect(actual.size).toBe(allPermissions);
  });
});

describe("loadAuthorizedUser against the real database", () => {
  it("resolves an EMPLOYEE's permissions from their granted role", async () => {
    const role = await prisma.role.findUniqueOrThrow({
      where: { key: "EMPLOYEE" },
    });
    const user = await prisma.user.create({
      data: {
        email: `authz-employee-${randomUUID()}@authtest.local`,
        displayName: "Authz Employee",
        firstName: "Authz",
        lastName: "Employee",
        authProvider: "LOCAL",
        passwordHash: "argon2id$fake$hash$for$testing",
      },
    });
    createdUserIds.push(user.id);
    await prisma.userRole.create({
      data: { userId: user.id, roleId: role.id },
    });

    const authz = await loadAuthorizedUser(user.id);
    const expected = new Set(
      ROLES.find((r) => r.key === "EMPLOYEE")?.permissions ?? [],
    );
    expect(authz.permissions).toEqual(expected);
    expect(authz.permissions.has("POST_APPROVE")).toBe(false);
  });

  it("resolves department and group membership alongside role permissions", async () => {
    const department = await prisma.department.create({
      data: { key: `authz-dept-${randomUUID()}`, name: "Authz Dept" },
    });
    createdDepartmentIds.push(department.id);
    const group = await prisma.group.create({
      data: { key: `authz-group-${randomUUID()}`, name: "Authz Group" },
    });
    createdGroupIds.push(group.id);
    const role = await prisma.role.findUniqueOrThrow({
      where: { key: "APPROVER" },
    });
    const user = await prisma.user.create({
      data: {
        email: `authz-approver-${randomUUID()}@authtest.local`,
        displayName: "Authz Approver",
        firstName: "Authz",
        lastName: "Approver",
        authProvider: "LOCAL",
        passwordHash: "argon2id$fake$hash$for$testing",
        departmentId: department.id,
      },
    });
    createdUserIds.push(user.id);
    await Promise.all([
      prisma.userRole.create({ data: { userId: user.id, roleId: role.id } }),
      prisma.userGroup.create({ data: { userId: user.id, groupId: group.id } }),
    ]);

    const authz = await loadAuthorizedUser(user.id);
    expect(authz.departmentId).toBe(department.id);
    expect(authz.groupIds.has(group.id)).toBe(true);
    expect(authz.permissions.has("POST_APPROVE")).toBe(true);
  });

  it("a user with no roles has no permissions at all", async () => {
    const user = await prisma.user.create({
      data: {
        email: `authz-noroles-${randomUUID()}@authtest.local`,
        displayName: "No Roles",
        firstName: "No",
        lastName: "Roles",
        authProvider: "LOCAL",
        passwordHash: "argon2id$fake$hash$for$testing",
      },
    });
    createdUserIds.push(user.id);

    const authz = await loadAuthorizedUser(user.id);
    expect(authz.permissions.size).toBe(0);
    expect(authz.groupIds.size).toBe(0);
  });
});
