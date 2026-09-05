import { describe, expect, it } from "vitest";
import { ROLES } from "../../prisma/lib/bootstrap-system-data";
import {
  PERMISSIONS,
  can,
  assert,
  ForbiddenError,
  type AuthorizedUser,
  type PermissionKey,
  type PolicyResource,
} from "@/modules/authorization";

/**
 * The permission x role x ownership matrix AUTHENTICATION.md §5 and §7
 * require, exercised as pure unit tests against synthetic users — no DB
 * needed, since `can`/`assert` are deliberately synchronous decision
 * functions over already-loaded data. tests/integration/authorization-
 * roles.test.ts separately proves the *real seeded* roles carry these same
 * grants.
 */

function roleGrants(
  key: "EMPLOYEE" | "APPROVER" | "ADMIN",
): Set<PermissionKey> {
  const role = ROLES.find((r) => r.key === key);
  if (!role) throw new Error(`Role ${key} not found in ROLES`);
  return new Set(role.permissions);
}

function makeUser(overrides: Partial<AuthorizedUser> = {}): AuthorizedUser {
  return {
    id: "user-1",
    departmentId: null,
    permissions: new Set(),
    groupIds: new Set(),
    ...overrides,
  };
}

const SCOPED_PERMISSIONS = new Set<PermissionKey>([
  "POST_READ_OWN",
  "POST_EDIT_OWN",
  "POST_SUBMIT",
  "POST_DELETE_OWN",
  "POST_CANCEL",
  "POST_APPROVE",
  "POST_REJECT",
  "POST_REQUEST_CHANGES",
  "APPROVAL_READ",
]);

describe("can — grant-only permissions", () => {
  const grantOnly = PERMISSIONS.map((p) => p.key).filter(
    (key) => !SCOPED_PERMISSIONS.has(key),
  );

  it("denies every grant-only permission the user doesn't hold, regardless of resource", () => {
    const user = makeUser();
    for (const key of grantOnly) {
      expect(can(user, key)).toBe(false);
    }
  });

  it("allows every grant-only permission the user does hold", () => {
    const user = makeUser({ permissions: new Set(grantOnly) });
    for (const key of grantOnly) {
      expect(can(user, key)).toBe(true);
    }
  });

  it("assert throws ForbiddenError naming the permission when not granted", () => {
    const user = makeUser();
    expect(() => assert(user, "AUDIT_READ")).toThrow(ForbiddenError);
    try {
      assert(user, "AUDIT_READ");
      throw new Error("expected assert to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
      expect((err as ForbiddenError).permission).toBe("AUDIT_READ");
    }
  });
});

describe("can — owned-post policy (POST_READ_OWN / POST_EDIT_OWN / POST_SUBMIT / POST_DELETE_OWN / POST_CANCEL)", () => {
  const employee = makeUser({ permissions: roleGrants("EMPLOYEE") });

  it("allows reading, editing, submitting, deleting and cancelling your own post", () => {
    const own: PolicyResource = { kind: "owned-post", creatorId: employee.id };
    expect(can(employee, "POST_READ_OWN", own)).toBe(true);
    expect(can(employee, "POST_EDIT_OWN", own)).toBe(true);
    expect(can(employee, "POST_SUBMIT", own)).toBe(true);
    expect(can(employee, "POST_DELETE_OWN", own)).toBe(true);
    expect(can(employee, "POST_CANCEL", own)).toBe(true);
  });

  it("denies cross-user draft access even though the permission is granted", () => {
    const someoneElses: PolicyResource = {
      kind: "owned-post",
      creatorId: "another-user",
    };
    expect(can(employee, "POST_READ_OWN", someoneElses)).toBe(false);
    expect(can(employee, "POST_EDIT_OWN", someoneElses)).toBe(false);
    expect(can(employee, "POST_SUBMIT", someoneElses)).toBe(false);
    expect(can(employee, "POST_DELETE_OWN", someoneElses)).toBe(false);
    expect(can(employee, "POST_CANCEL", someoneElses)).toBe(false);
    expect(() => assert(employee, "POST_EDIT_OWN", someoneElses)).toThrow(
      ForbiddenError,
    );
  });

  it("denies outright when the user doesn't hold the permission at all", () => {
    const noGrants = makeUser();
    const own: PolicyResource = { kind: "owned-post", creatorId: noGrants.id };
    expect(can(noGrants, "POST_READ_OWN", own)).toBe(false);
    expect(can(noGrants, "POST_SUBMIT", own)).toBe(false);
  });

  it("fails closed with no resource, or the wrong resource kind", () => {
    expect(can(employee, "POST_EDIT_OWN")).toBe(false);
    expect(can(employee, "POST_SUBMIT")).toBe(false);
    expect(
      can(employee, "POST_EDIT_OWN", {
        kind: "approval-read",
        postDepartmentId: null,
        assignment: null,
      }),
    ).toBe(false);
  });
});

describe("can — approval-action policy (POST_APPROVE / POST_REJECT / POST_REQUEST_CHANGES)", () => {
  const approver = makeUser({
    id: "approver-1",
    permissions: roleGrants("APPROVER"),
    groupIds: new Set(["group-1"]),
  });

  function openAssignment(
    overrides: Partial<
      Extract<PolicyResource, { kind: "approval-action" }>["assignment"]
    > = {},
  ): PolicyResource {
    return {
      kind: "approval-action",
      postCreatorId: "creator-1",
      postVersionId: "version-1",
      assignment: {
        postVersionId: "version-1",
        assigneeUserId: approver.id,
        assigneeGroupId: null,
        status: "PENDING",
        ...overrides,
      },
    };
  }

  it("employee cannot approve — the permission isn't even granted", () => {
    const employee = makeUser({ permissions: roleGrants("EMPLOYEE") });
    expect(can(employee, "POST_APPROVE", openAssignment())).toBe(false);
    expect(() => assert(employee, "POST_APPROVE", openAssignment())).toThrow(
      ForbiddenError,
    );
  });

  it("allows an approver directly assigned to an open assignment on the version under review", () => {
    expect(can(approver, "POST_APPROVE", openAssignment())).toBe(true);
    expect(can(approver, "POST_REJECT", openAssignment())).toBe(true);
    expect(can(approver, "POST_REQUEST_CHANGES", openAssignment())).toBe(true);
  });

  it("allows an approver assigned only through a group they belong to", () => {
    const viaGroup = openAssignment({
      assigneeUserId: null,
      assigneeGroupId: "group-1",
    });
    expect(can(approver, "POST_APPROVE", viaGroup)).toBe(true);
  });

  it("denies an approver targeted by neither their id nor their groups", () => {
    const notMine = openAssignment({
      assigneeUserId: "someone-else",
      assigneeGroupId: "some-other-group",
    });
    expect(can(approver, "POST_APPROVE", notMine)).toBe(false);
  });

  it("never lets anyone approve their own content, even if somehow assigned", () => {
    const ownContent: PolicyResource = {
      kind: "approval-action",
      postCreatorId: approver.id,
      postVersionId: "version-1",
      assignment: {
        postVersionId: "version-1",
        assigneeUserId: approver.id,
        assigneeGroupId: null,
        status: "PENDING",
      },
    };
    expect(can(approver, "POST_APPROVE", ownContent)).toBe(false);
  });

  it("denies when the assignment isn't open (already decided or cancelled)", () => {
    for (const status of ["COMPLETED", "CANCELLED", "ESCALATED"] as const) {
      expect(can(approver, "POST_APPROVE", openAssignment({ status }))).toBe(
        false,
      );
    }
  });

  it("denies when the assignment targets a different version than the one under review", () => {
    const wrongVersion = openAssignment({ postVersionId: "version-2" });
    expect(can(approver, "POST_APPROVE", wrongVersion)).toBe(false);
  });

  it("denies when there is no assignment at all", () => {
    const noAssignment: PolicyResource = {
      kind: "approval-action",
      postCreatorId: "creator-1",
      postVersionId: "version-1",
      assignment: null,
    };
    expect(can(approver, "POST_APPROVE", noAssignment)).toBe(false);
  });
});

describe("can — approval-read policy (APPROVAL_READ)", () => {
  const approver = makeUser({
    id: "approver-1",
    departmentId: "dept-1",
    permissions: roleGrants("APPROVER"),
    groupIds: new Set(["group-1"]),
  });

  it("denies without the base APPROVAL_READ grant", () => {
    const employee = makeUser({ permissions: roleGrants("EMPLOYEE") });
    expect(
      can(employee, "APPROVAL_READ", {
        kind: "approval-read",
        postDepartmentId: null,
        assignment: null,
      }),
    ).toBe(false);
  });

  it("allows when assigned directly", () => {
    expect(
      can(approver, "APPROVAL_READ", {
        kind: "approval-read",
        postDepartmentId: "some-other-dept",
        assignment: { assigneeUserId: approver.id, assigneeGroupId: null },
      }),
    ).toBe(true);
  });

  it("allows when assigned through a group", () => {
    expect(
      can(approver, "APPROVAL_READ", {
        kind: "approval-read",
        postDepartmentId: "some-other-dept",
        assignment: { assigneeUserId: null, assigneeGroupId: "group-1" },
      }),
    ).toBe(true);
  });

  it("allows the same department even without an assignment", () => {
    expect(
      can(approver, "APPROVAL_READ", {
        kind: "approval-read",
        postDepartmentId: "dept-1",
        assignment: null,
      }),
    ).toBe(true);
  });

  it("denies a different department with no assignment and no POST_READ_ALL", () => {
    const noReadAll = makeUser({
      departmentId: "dept-1",
      permissions: new Set(["APPROVAL_READ"]),
    });
    expect(
      can(noReadAll, "APPROVAL_READ", {
        kind: "approval-read",
        postDepartmentId: "dept-2",
        assignment: null,
      }),
    ).toBe(false);
  });

  it("POST_READ_ALL bypasses department and assignment entirely", () => {
    const readAll = makeUser({
      departmentId: "dept-1",
      permissions: new Set(["APPROVAL_READ", "POST_READ_ALL"]),
    });
    expect(
      can(readAll, "APPROVAL_READ", {
        kind: "approval-read",
        postDepartmentId: "dept-2",
        assignment: null,
      }),
    ).toBe(true);
  });
});

describe("default role grants match AUTHENTICATION.md §5's table", () => {
  it("EMPLOYEE holds only its own-post permissions", () => {
    const grants = roleGrants("EMPLOYEE");
    expect(grants.has("POST_CREATE")).toBe(true);
    expect(grants.has("POST_APPROVE")).toBe(false);
    expect(grants.has("USER_MANAGE")).toBe(false);
  });

  it("APPROVER adds approval + report permissions on top of EMPLOYEE's", () => {
    const grants = roleGrants("APPROVER");
    expect(grants.has("POST_CREATE")).toBe(true);
    expect(grants.has("POST_APPROVE")).toBe(true);
    expect(grants.has("REPORT_READ")).toBe(true);
    expect(grants.has("USER_MANAGE")).toBe(false);
  });

  it("ADMIN holds every catalogued permission", () => {
    const grants = roleGrants("ADMIN");
    for (const permission of PERMISSIONS) {
      expect(grants.has(permission.key)).toBe(true);
    }
  });
});
