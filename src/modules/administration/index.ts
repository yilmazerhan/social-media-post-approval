/**
 * User, role, group and department administration —
 * IMPLEMENTATION_PLAN.md Phase 21, API.md's `/api/v1/users`,
 * `/departments`, `/groups`, `/admin/roles`, `/admin/permissions`.
 *
 * Public surface of this module. Other modules and route handlers import
 * from here — never from a file inside this directory directly. See
 * ARCHITECTURE.md §2 (module rules) for the boundary contract.
 */
export {
  listUsers,
  getUserDetail,
  createUser,
  updateUser,
  setUserEnabled,
  assignRole,
  removeRole,
  adminResetPassword,
  listUserSessions,
  revokeAllSessionsForUser,
  type UserSummaryDto,
  type ListUsersFilters,
  type AdminSessionDto,
} from "./users";
export {
  listRoles,
  listPermissions,
  createRole,
  updateRolePermissions,
  type RoleDto,
} from "./roles";
// NB: CreateRoleInput is exported once below, from ./validation.
export {
  listGroups,
  createGroup,
  updateGroup,
  listGroupMembers,
  addGroupMember,
  removeGroupMember,
  type GroupDto,
  type GroupMemberDto,
} from "./groups";
export {
  listDepartments,
  createDepartment,
  updateDepartment,
  type DepartmentDto,
} from "./departments";
export {
  listApprovalRules,
  createApprovalRule,
  updateApprovalRule,
  deleteApprovalRule,
} from "./approval-rules";
export {
  listSlaPolicies,
  createSlaPolicy,
  updateSlaPolicy,
  deleteSlaPolicy,
} from "./sla-policies";
export {
  getEmailSettings,
  listEmailTemplates,
  updateEmailTemplate,
  previewEmailTemplate,
  listEmailLogs,
  type EmailSettingsDto,
  type EmailTemplatePreviewDto,
} from "./email";
export {
  listRetentionPolicies,
  updateRetentionPolicy,
  runRetention,
  listRetentionRuns,
} from "./retention";
export {
  listJobs,
  getJob,
  retryJob,
  cancelJob,
  listJobSchedules,
  updateJobSchedule,
  runJobScheduleNow,
  type ListJobsFilters,
} from "./jobs";
export { listAuditLogs, type ListAuditLogsFilters } from "./audit";
export { listWorkflowTransitions } from "./workflow";
export {
  listNotificationVolumeSummary,
  type NotificationVolumeSummary,
} from "./notifications";
export {
  listSystemSettings,
  updateSystemSetting,
  type SystemSettingDto,
} from "./settings";
export {
  createUserSchema,
  updateUserSchema,
  assignRoleSchema,
  adminResetPasswordSchema,
  createRoleSchema,
  updateRolePermissionsSchema,
  groupSchema,
  updateGroupSchema,
  groupMemberSchema,
  departmentSchema,
  updateDepartmentSchema,
  approvalRuleSchema,
  updateApprovalRuleSchema,
  slaPolicySchema,
  updateSlaPolicySchema,
  emailTemplateSchema,
  emailTemplatePreviewSchema,
  retentionPolicySchema,
  retentionRunSchema,
  jobScheduleUpdateSchema,
  systemSettingSchema,
  type CreateUserInput,
  type UpdateUserInput,
  type AssignRoleInput,
  type AdminResetPasswordInput,
  type CreateRoleInput,
  type UpdateRolePermissionsInput,
  type GroupInput,
  type UpdateGroupInput,
  type GroupMemberInput,
  type DepartmentInput,
  type UpdateDepartmentInput,
  type ApprovalRuleInput,
  type UpdateApprovalRuleInput,
  type SlaPolicyInput,
  type UpdateSlaPolicyInput,
  type EmailTemplateInput,
  type EmailTemplatePreviewInput,
  type RetentionPolicyInput,
  type RetentionRunInput,
  type JobScheduleUpdateInput,
  type SystemSettingInput,
} from "./validation";
