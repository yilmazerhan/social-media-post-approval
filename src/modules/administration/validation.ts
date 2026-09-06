import { z } from "zod";

export const createUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(200),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  jobTitle: z.string().max(200).optional(),
  departmentId: z.string().uuid().nullable().optional(),
  roleKeys: z.array(z.string()).default([]),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  jobTitle: z.string().max(200).nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  timezone: z.string().max(100).nullable().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const assignRoleSchema = z.object({ roleKey: z.string().min(1) });
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;

export const adminResetPasswordSchema = z.object({
  newPassword: z.string().min(1),
});
export type AdminResetPasswordInput = z.infer<typeof adminResetPasswordSchema>;

export const updateRolePermissionsSchema = z.object({
  permissionKeys: z.array(z.string()),
});
export type UpdateRolePermissionsInput = z.infer<
  typeof updateRolePermissionsSchema
>;

export const createRoleSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(50)
    .regex(
      /^[A-Z][A-Z0-9_]*$/,
      "Uppercase letters, digits and underscores only.",
    ),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  permissionKeys: z.array(z.string()).default([]),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const groupSchema = z.object({
  key: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  isApprovalGroup: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
export type GroupInput = z.infer<typeof groupSchema>;

export const updateGroupSchema = groupSchema.partial();
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

export const groupMemberSchema = z.object({ userId: z.string().uuid() });
export type GroupMemberInput = z.infer<typeof groupMemberSchema>;

export const departmentSchema = z.object({
  key: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  managerId: z.string().uuid().nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().default(true),
});
export type DepartmentInput = z.infer<typeof departmentSchema>;

export const updateDepartmentSchema = departmentSchema.partial();
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;

const priorityEnum = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);
const targetTypeEnum = z.enum(["USER", "GROUP", "DEPARTMENT_MANAGER"]);

export const approvalRuleSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  isActive: z.boolean().default(true),
  priorityOrder: z.number().int().min(0),
  departmentId: z.string().uuid().nullable().optional(),
  priority: priorityEnum.nullable().optional(),
  creatorGroupId: z.string().uuid().nullable().optional(),
  targetType: targetTypeEnum,
  targetUserId: z.string().uuid().nullable().optional(),
  targetGroupId: z.string().uuid().nullable().optional(),
  slaPolicyId: z.string().uuid().nullable().optional(),
  allowCreatorOverride: z.boolean().default(false),
});
export type ApprovalRuleInput = z.infer<typeof approvalRuleSchema>;

export const updateApprovalRuleSchema = approvalRuleSchema.partial();
export type UpdateApprovalRuleInput = z.infer<typeof updateApprovalRuleSchema>;

export const slaPolicySchema = z.object({
  name: z.string().min(1).max(200),
  priority: priorityEnum.nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  durationMinutes: z.number().int().min(1),
  warningThresholdPercent: z.number().int().min(1).max(100).default(75),
  businessHoursOnly: z.boolean().default(false),
  escalationAfterMinutes: z.number().int().min(1).nullable().optional(),
  escalationTargetType: targetTypeEnum.nullable().optional(),
  escalationUserId: z.string().uuid().nullable().optional(),
  escalationGroupId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().default(true),
});
export type SlaPolicyInput = z.infer<typeof slaPolicySchema>;

export const updateSlaPolicySchema = slaPolicySchema.partial();
export type UpdateSlaPolicyInput = z.infer<typeof updateSlaPolicySchema>;

export const emailTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  subjectTemplate: z.string().min(1).max(500).optional(),
  bodyTemplate: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});
export type EmailTemplateInput = z.infer<typeof emailTemplateSchema>;

export const emailTemplatePreviewSchema = z.object({
  variables: z.record(z.string(), z.union([z.string(), z.number()])),
});
export type EmailTemplatePreviewInput = z.infer<
  typeof emailTemplatePreviewSchema
>;

export const retentionPolicySchema = z.object({
  retentionDays: z.number().int().min(1).optional(),
  isEnabled: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  description: z.string().max(1000).optional(),
});
export type RetentionPolicyInput = z.infer<typeof retentionPolicySchema>;

export const retentionRunSchema = z.object({
  target: z.enum([
    "POST",
    "ATTACHMENT",
    "COMMENT",
    "NOTIFICATION",
    "EMAIL_LOG",
    "AUDIT_LOG",
    "BACKGROUND_JOB",
    "SESSION",
  ]),
  dryRun: z.boolean().default(true),
});
export type RetentionRunInput = z.infer<typeof retentionRunSchema>;

export const jobScheduleUpdateSchema = z.object({
  cronExpression: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
  isEnabled: z.boolean().optional(),
});
export type JobScheduleUpdateInput = z.infer<typeof jobScheduleUpdateSchema>;

export const systemSettingSchema = z.object({
  value: z.string(),
});
export type SystemSettingInput = z.infer<typeof systemSettingSchema>;
