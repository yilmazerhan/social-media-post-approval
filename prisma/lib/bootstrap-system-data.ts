/**
 * System data every environment needs to be minimally usable — permissions,
 * the three system roles, SLA policies, retention policies, email
 * templates, job schedules, and a catch-all approval rule. Safe to run in
 * production; every write is an upsert keyed on a stable business key, so
 * running it twice changes nothing on the second run.
 *
 * Shared by `prisma/bootstrap.ts` (production-safe) and `prisma/seed.ts`
 * (development demo data, which calls this first).
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { config } from "@/server/config";

export const PERMISSIONS: Array<{
  key: string;
  category: string;
  description: string;
}> = [
  { key: "POST_CREATE", category: "posts", description: "Create a new post" },
  {
    key: "POST_READ_OWN",
    category: "posts",
    description: "Read your own posts",
  },
  { key: "POST_READ_ALL", category: "posts", description: "Read any post" },
  {
    key: "POST_EDIT_OWN",
    category: "posts",
    description: "Edit your own draft or returned post",
  },
  { key: "POST_EDIT_ALL", category: "posts", description: "Edit any post" },
  {
    key: "POST_DELETE_OWN",
    category: "posts",
    description: "Delete your own draft",
  },
  {
    key: "POST_SUBMIT",
    category: "posts",
    description: "Submit a post for approval",
  },
  {
    key: "POST_APPROVE",
    category: "approvals",
    description: "Approve a post version",
  },
  {
    key: "POST_REJECT",
    category: "approvals",
    description: "Reject a post version",
  },
  {
    key: "POST_REQUEST_CHANGES",
    category: "approvals",
    description: "Request changes on a post version",
  },
  { key: "POST_COMMENT", category: "posts", description: "Comment on a post" },
  {
    key: "POST_CANCEL",
    category: "posts",
    description: "Cancel your own post",
  },
  {
    key: "APPROVAL_READ",
    category: "approvals",
    description: "View the approval queue",
  },
  {
    key: "APPROVAL_ASSIGN",
    category: "approvals",
    description: "Assign or reassign an approver",
  },
  {
    key: "APPROVAL_REASSIGN",
    category: "approvals",
    description: "Reassign an in-flight approval",
  },
  { key: "USER_READ", category: "administration", description: "View users" },
  {
    key: "USER_MANAGE",
    category: "administration",
    description: "Create, disable and configure users",
  },
  {
    key: "ROLE_MANAGE",
    category: "administration",
    description: "Manage roles and permission grants",
  },
  {
    key: "GROUP_MANAGE",
    category: "administration",
    description: "Manage groups",
  },
  {
    key: "DEPARTMENT_MANAGE",
    category: "administration",
    description: "Manage departments",
  },
  { key: "REPORT_READ", category: "reports", description: "View reports" },
  { key: "AUDIT_READ", category: "audit", description: "View the audit log" },
  {
    key: "RETENTION_MANAGE",
    category: "administration",
    description: "Configure and run retention",
  },
  {
    key: "SETTINGS_MANAGE",
    category: "administration",
    description: "Change system settings",
  },
  {
    key: "JOB_MANAGE",
    category: "administration",
    description: "View and retry background jobs",
  },
  {
    key: "EMAIL_MANAGE",
    category: "administration",
    description: "Configure email and templates",
  },
];

const EMPLOYEE_PERMISSIONS = [
  "POST_CREATE",
  "POST_READ_OWN",
  "POST_EDIT_OWN",
  "POST_DELETE_OWN",
  "POST_SUBMIT",
  "POST_COMMENT",
  "POST_CANCEL",
];

const APPROVER_PERMISSIONS = [
  ...EMPLOYEE_PERMISSIONS,
  "POST_READ_ALL",
  "POST_APPROVE",
  "POST_REJECT",
  "POST_REQUEST_CHANGES",
  "APPROVAL_READ",
  "APPROVAL_ASSIGN",
  "APPROVAL_REASSIGN",
  "REPORT_READ",
];

const ADMIN_PERMISSIONS = PERMISSIONS.map((p) => p.key);

export const ROLES: Array<{
  key: string;
  name: string;
  permissions: string[];
}> = [
  { key: "EMPLOYEE", name: "Employee", permissions: EMPLOYEE_PERMISSIONS },
  { key: "APPROVER", name: "Approver", permissions: APPROVER_PERMISSIONS },
  { key: "ADMIN", name: "Administrator", permissions: ADMIN_PERMISSIONS },
];

const EMAIL_TEMPLATES: Array<{
  key: string;
  name: string;
  subjectTemplate: string;
  bodyTemplate: string;
}> = [
  {
    key: "new_approval_request",
    name: "New approval request",
    subjectTemplate: "Approval needed: {{postTitle}}",
    bodyTemplate:
      '<p>{{creatorName}} submitted <strong>{{postTitle}}</strong> (version {{version}}) for your review.</p><p><a href="{{reviewUrl}}">Review it</a>. Due {{dueAt}}.</p>',
  },
  {
    key: "changes_requested",
    name: "Changes requested",
    subjectTemplate: "Changes requested on {{postTitle}}",
    bodyTemplate:
      '<p>{{approverName}} requested changes on <strong>{{postTitle}}</strong>.</p><p>{{comment}}</p><p><a href="{{postUrl}}">Open the post</a>.</p>',
  },
  {
    key: "post_approved",
    name: "Post approved",
    subjectTemplate: "Approved: {{postTitle}}",
    bodyTemplate:
      '<p><strong>{{postTitle}}</strong> (version {{version}}) was approved by {{approverName}}.</p><p><a href="{{postUrl}}">View it</a>.</p>',
  },
  {
    key: "post_rejected",
    name: "Post rejected",
    subjectTemplate: "Rejected: {{postTitle}}",
    bodyTemplate:
      '<p><strong>{{postTitle}}</strong> was rejected by {{approverName}}.</p><p>{{reason}}</p><p><a href="{{postUrl}}">View it</a>.</p>',
  },
  {
    key: "sla_warning",
    name: "SLA warning",
    subjectTemplate: "Due soon: {{postTitle}}",
    bodyTemplate:
      '<p><strong>{{postTitle}}</strong> is due for review by {{dueAt}}.</p><p><a href="{{reviewUrl}}">Review it</a>.</p>',
  },
  {
    key: "sla_escalation",
    name: "SLA escalation",
    subjectTemplate: "Overdue: {{postTitle}}",
    bodyTemplate:
      '<p><strong>{{postTitle}}</strong> is overdue for review. This has been escalated to you.</p><p><a href="{{reviewUrl}}">Review it</a>.</p>',
  },
  {
    key: "daily_digest",
    name: "Daily approval digest",
    subjectTemplate: "Your pending approvals ({{pendingCount}})",
    bodyTemplate:
      "<p>You have {{pendingCount}} post(s) awaiting your review:</p>{{items}}",
  },
  {
    key: "password_reset",
    name: "Password reset",
    subjectTemplate: "Reset your {{appName}} password",
    bodyTemplate:
      '<p>Use the link below to reset your password. It expires in {{ttlMinutes}} minutes and can be used once.</p><p><a href="{{resetUrl}}">Reset password</a></p><p>If you did not request this, no action is needed.</p>',
  },
];

/** durationMinutes per priority; the HIGH row matches the seeded demo fixture's 18h-waited/6h-remaining math. */
const SLA_POLICIES: Array<{
  key: string;
  name: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT" | null;
  durationMinutes: number;
}> = [
  {
    key: "sla-global-default",
    name: "Global default",
    priority: null,
    durationMinutes: config.SLA_DEFAULT_MINUTES,
  },
  {
    key: "sla-low",
    name: "Low priority",
    priority: "LOW",
    durationMinutes: 4320,
  },
  {
    key: "sla-normal",
    name: "Normal priority",
    priority: "NORMAL",
    durationMinutes: 2880,
  },
  {
    key: "sla-high",
    name: "High priority",
    priority: "HIGH",
    durationMinutes: 1440,
  },
  {
    key: "sla-urgent",
    name: "Urgent priority",
    priority: "URGENT",
    durationMinutes: 480,
  },
];

/**
 * COMMENT and SESSION have no dedicated CONFIGURATION.md variable (only
 * post/attachment/notification/email-log/audit-log/job do). Comments
 * follow the post retention window; session rows are pruned quickly once
 * expired or revoked — both are judgment calls, recorded here rather than
 * invented silently.
 */
const RETENTION_POLICIES: Array<{ target: string; retentionDays: number }> = [
  { target: "POST", retentionDays: config.RETENTION_DAYS },
  { target: "ATTACHMENT", retentionDays: config.RETENTION_ATTACHMENT_DAYS },
  { target: "COMMENT", retentionDays: config.RETENTION_DAYS },
  { target: "NOTIFICATION", retentionDays: config.RETENTION_NOTIFICATION_DAYS },
  { target: "EMAIL_LOG", retentionDays: config.RETENTION_EMAIL_LOG_DAYS },
  { target: "AUDIT_LOG", retentionDays: config.RETENTION_AUDIT_LOG_DAYS },
  { target: "BACKGROUND_JOB", retentionDays: config.RETENTION_JOB_DAYS },
  { target: "SESSION", retentionDays: 7 },
];

const JOB_SCHEDULES: Array<{
  key: string;
  jobType: string;
  cronExpression: string;
  timezone: string;
}> = [
  {
    key: "daily-digest",
    jobType: "DAILY_DIGEST",
    cronExpression: `0 ${config.DIGEST_HOUR} * * *`,
    timezone: config.APP_TIMEZONE,
  },
  {
    key: "sla-check",
    jobType: "SLA_CHECK",
    cronExpression: "*/15 * * * *",
    timezone: "UTC",
  },
  {
    key: "retention-cleanup",
    jobType: "RETENTION_CLEANUP",
    cronExpression: "30 2 * * *",
    timezone: "UTC",
  },
  {
    key: "orphan-attachment-cleanup",
    jobType: "ORPHAN_ATTACHMENT_CLEANUP",
    cronExpression: "0 3 * * *",
    timezone: "UTC",
  },
  {
    key: "temp-file-cleanup",
    jobType: "TEMP_FILE_CLEANUP",
    cronExpression: "0 * * * *",
    timezone: "UTC",
  },
  {
    key: "session-cleanup",
    jobType: "SESSION_CLEANUP",
    cronExpression: "30 * * * *",
    timezone: "UTC",
  },
];

const CATCH_ALL_APPROVAL_RULE_KEY = "catch-all";

export async function bootstrapSystemData(prisma: PrismaClient) {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      create: permission,
      update: {
        category: permission.category,
        description: permission.description,
      },
    });
  }

  for (const role of ROLES) {
    const row = await prisma.role.upsert({
      where: { key: role.key },
      create: { key: role.key, name: role.name, isSystem: true },
      update: { name: role.name, isSystem: true },
    });

    const permissions = await prisma.permission.findMany({
      where: { key: { in: role.permissions } },
      select: { id: true },
    });
    for (const permission of permissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: row.id, permissionId: permission.id },
        },
        create: { roleId: row.id, permissionId: permission.id },
        update: {},
      });
    }
  }

  for (const template of EMAIL_TEMPLATES) {
    await prisma.emailTemplate.upsert({
      where: { key: template.key },
      create: { ...template, isHtml: true, locale: "en" },
      update: {
        name: template.name,
        subjectTemplate: template.subjectTemplate,
        bodyTemplate: template.bodyTemplate,
      },
    });
  }

  for (const policy of SLA_POLICIES) {
    const existing = await prisma.slaPolicy.findFirst({
      where: { departmentId: null, priority: policy.priority },
    });
    if (existing) {
      await prisma.slaPolicy.update({
        where: { id: existing.id },
        data: { name: policy.name, durationMinutes: policy.durationMinutes },
      });
    } else {
      await prisma.slaPolicy.create({
        data: {
          name: policy.name,
          priority: policy.priority,
          durationMinutes: policy.durationMinutes,
          warningThresholdPercent: config.SLA_WARNING_PERCENT,
          escalationAfterMinutes: config.SLA_ESCALATION_MINUTES,
        },
      });
    }
  }

  for (const policy of RETENTION_POLICIES) {
    await prisma.retentionPolicy.upsert({
      where: { target: policy.target as never },
      create: {
        target: policy.target as never,
        retentionDays: policy.retentionDays,
        dryRun: config.RETENTION_DRY_RUN,
        description: `Retention window for ${policy.target.toLowerCase()} records.`,
      },
      update: { retentionDays: policy.retentionDays },
    });
  }

  for (const schedule of JOB_SCHEDULES) {
    await prisma.jobSchedule.upsert({
      where: { key: schedule.key },
      create: {
        key: schedule.key,
        jobType: schedule.jobType as never,
        cronExpression: schedule.cronExpression,
        timezone: schedule.timezone,
      },
      update: {
        cronExpression: schedule.cronExpression,
        timezone: schedule.timezone,
      },
    });
  }

  const catchAllExists = await prisma.approvalRule.findFirst({
    where: { name: CATCH_ALL_APPROVAL_RULE_KEY },
  });
  if (!catchAllExists) {
    await prisma.approvalRule.create({
      data: {
        name: CATCH_ALL_APPROVAL_RULE_KEY,
        description:
          "Last-resort route so submission never fails to resolve an approver. Routes to the post's department manager.",
        isActive: true,
        priorityOrder: 1_000_000,
        targetType: "DEPARTMENT_MANAGER",
      },
    });
  }
}
