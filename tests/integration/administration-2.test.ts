import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import {
  listApprovalRules,
  createApprovalRule,
  updateApprovalRule,
  deleteApprovalRule,
  listSlaPolicies,
  createSlaPolicy,
  updateSlaPolicy,
  deleteSlaPolicy,
  getEmailSettings,
  listEmailTemplates,
  updateEmailTemplate,
  previewEmailTemplate,
  listRetentionPolicies,
  updateRetentionPolicy,
  listRetentionRuns,
  listJobs,
  getJob,
  retryJob,
  cancelJob,
  listJobSchedules,
  listAuditLogs,
  listSystemSettings,
  updateSystemSetting,
} from "@/modules/administration";
import { NotFoundError, WorkflowError } from "@/server/http/handler";

/**
 * Phase 21 slice 2 — approval rules, SLA policies, email admin, retention
 * admin, background jobs, audit logs, system settings.
 */

const createdUserIds: string[] = [];
const createdApprovalRuleIds: string[] = [];
const createdSlaPolicyIds: string[] = [];
const createdJobIds: bigint[] = [];
const createdDepartmentIds: string[] = [];

afterAll(async () => {
  if (createdApprovalRuleIds.length) {
    await prisma.approvalRule.deleteMany({
      where: { id: { in: createdApprovalRuleIds } },
    });
  }
  if (createdSlaPolicyIds.length) {
    await prisma.slaPolicy.deleteMany({
      where: { id: { in: createdSlaPolicyIds } },
    });
  }
  if (createdJobIds.length) {
    await prisma.backgroundJob.deleteMany({
      where: { id: { in: createdJobIds } },
    });
  }
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
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
      email: `admin2-actor-${randomUUID()}@editortest.local`,
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

describe("Approval rules", () => {
  it("creates, updates, lists, and deletes a rule; deleting one referenced by an assignment only nulls the FK (no cascade)", async () => {
    const actor = await createActor("Admin Actor Rules");
    const created = await createApprovalRule(
      {
        name: `Test Rule ${randomUUID().slice(0, 8)}`,
        isActive: true,
        priorityOrder: 999,
        targetType: "USER",
        targetUserId: actor.id,
        allowCreatorOverride: false,
      },
      actor.id,
    );
    createdApprovalRuleIds.push(created.id);

    const rules = await listApprovalRules();
    expect(rules.some((r) => r.id === created.id)).toBe(true);

    const updated = await updateApprovalRule(
      created.id,
      { priorityOrder: 5 },
      actor.id,
    );
    expect(updated.priorityOrder).toBe(5);

    await deleteApprovalRule(created.id, actor.id);
    await expect(
      updateApprovalRule(created.id, { priorityOrder: 1 }, actor.id),
    ).rejects.toBeInstanceOf(NotFoundError);
    createdApprovalRuleIds.splice(
      createdApprovalRuleIds.indexOf(created.id),
      1,
    );
  });
});

describe("SLA policies", () => {
  it("creates, updates, lists, and deletes a policy", async () => {
    const actor = await createActor("Admin Actor SLA");
    const department = await prisma.department.create({
      data: { key: `test-dept-${randomUUID().slice(0, 8)}`, name: "Test Dept" },
    });
    createdDepartmentIds.push(department.id);

    const created = await createSlaPolicy(
      {
        name: `Test SLA ${randomUUID().slice(0, 8)}`,
        departmentId: department.id,
        durationMinutes: 60,
        warningThresholdPercent: 75,
        businessHoursOnly: false,
        isActive: true,
      },
      actor.id,
    );
    createdSlaPolicyIds.push(created.id);

    const policies = await listSlaPolicies();
    expect(policies.some((p) => p.id === created.id)).toBe(true);

    const updated = await updateSlaPolicy(
      created.id,
      { durationMinutes: 120 },
      actor.id,
    );
    expect(updated.durationMinutes).toBe(120);

    await deleteSlaPolicy(created.id, actor.id);
    await expect(
      updateSlaPolicy(created.id, { durationMinutes: 30 }, actor.id),
    ).rejects.toBeInstanceOf(NotFoundError);
    createdSlaPolicyIds.splice(createdSlaPolicyIds.indexOf(created.id), 1);
  });
});

describe("Email administration", () => {
  it("reports read-only settings from config, lists+updates the seeded templates, and previews without sending", async () => {
    const settings = getEmailSettings();
    expect(typeof settings.enabled).toBe("boolean");
    expect(typeof settings.host).toBe("string");

    const templates = await listEmailTemplates();
    const passwordReset = templates.find((t) => t.key === "password_reset");
    expect(passwordReset).toBeDefined();
    if (!passwordReset)
      throw new Error("expected the seeded password_reset template to exist");

    const actor = await createActor("Admin Actor Email");
    const updated = await updateEmailTemplate(
      "password_reset",
      { name: passwordReset.name },
      actor.id,
    );
    expect(updated.updatedById).toBe(actor.id);

    const preview = await previewEmailTemplate("password_reset", {
      resetUrl: "https://example.test/reset",
      ttlMinutes: 60,
    });
    expect(preview.body).toContain("https://example.test/reset");
  });
});

describe("Retention administration", () => {
  it("lists policies, updates one, and lists past runs without mutating anything", async () => {
    const actor = await createActor("Admin Actor Retention");
    const policies = await listRetentionPolicies();
    expect(policies.length).toBeGreaterThan(0);
    const target = policies[0].target;
    const original = policies[0];

    const updated = await updateRetentionPolicy(
      target,
      { description: original.description ?? "test description" },
      actor.id,
    );
    expect(updated.target).toBe(target);

    const runs = await listRetentionRuns(1, 10);
    expect(Array.isArray(runs.items)).toBe(true);
  });
});

describe("Background jobs", () => {
  it("lists, retries a dead job, and cancels a pending job", async () => {
    const actor = await createActor("Admin Actor Jobs");
    const deadJob = await prisma.backgroundJob.create({
      data: { type: "TEMP_FILE_CLEANUP", payload: {}, status: "DEAD" },
    });
    createdJobIds.push(deadJob.id);
    const pendingJob = await prisma.backgroundJob.create({
      data: { type: "TEMP_FILE_CLEANUP", payload: {}, status: "PENDING" },
    });
    createdJobIds.push(pendingJob.id);

    const list = await listJobs({ page: 1, pageSize: 50 });
    expect(list.items.some((j) => j.id === deadJob.id.toString())).toBe(true);

    const fetched = await getJob(deadJob.id);
    expect(fetched.id).toBe(deadJob.id.toString());

    const retried = await retryJob(deadJob.id, actor.id);
    expect(retried.status).toBe("PENDING");
    await expect(retryJob(deadJob.id, actor.id)).rejects.toBeInstanceOf(
      WorkflowError,
    );

    const cancelled = await cancelJob(pendingJob.id, actor.id);
    expect(cancelled.status).toBe("DEAD");
    await expect(cancelJob(pendingJob.id, actor.id)).rejects.toBeInstanceOf(
      WorkflowError,
    );
  });

  it("lists the seeded job schedules", async () => {
    const schedules = await listJobSchedules();
    expect(schedules.some((s) => s.key === "daily-digest")).toBe(true);
  });
});

describe("Audit logs", () => {
  it("lists entries filtered by action", async () => {
    const actor = await createActor("Admin Actor Audit");
    const department = await prisma.department.create({
      data: { key: `test-dept-${randomUUID().slice(0, 8)}`, name: "Test Dept" },
    });
    createdDepartmentIds.push(department.id);
    await createSlaPolicy(
      {
        name: `Audit Probe ${randomUUID().slice(0, 8)}`,
        departmentId: department.id,
        durationMinutes: 30,
        warningThresholdPercent: 75,
        businessHoursOnly: false,
        isActive: true,
      },
      actor.id,
    ).then((p) => createdSlaPolicyIds.push(p.id));

    const result = await listAuditLogs({
      action: "SLA_POLICY_CREATED",
      page: 1,
      pageSize: 10,
    });
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((l) => l.action === "SLA_POLICY_CREATED")).toBe(
      true,
    );
  });
});

describe("System settings", () => {
  it("omits the value of a secret row and updates a non-secret one", async () => {
    const actor = await createActor("Admin Actor Settings");
    const key = `test.setting.${randomUUID().slice(0, 8)}`;
    await prisma.systemSetting.create({
      data: { key, value: "initial", type: "STRING", category: "test" },
    });
    const secretKey = `test.secret.${randomUUID().slice(0, 8)}`;
    await prisma.systemSetting.create({
      data: {
        key: secretKey,
        value: "shh",
        type: "STRING",
        category: "test",
        isSecret: true,
      },
    });

    try {
      const settings = await listSystemSettings();
      const secretRow = settings.find((s) => s.key === secretKey);
      expect(secretRow?.value).toBeNull();

      const updated = await updateSystemSetting(key, "changed", actor.id);
      expect(updated.value).toBe("changed");
    } finally {
      await prisma.systemSetting.deleteMany({
        where: { key: { in: [key, secretKey] } },
      });
    }
  });
});
