/**
 * The permission catalogue — AUTHENTICATION.md §5. This is the single
 * source of truth: `prisma/lib/bootstrap-system-data.ts` seeds the
 * `Permission` table from this array rather than keeping its own copy, so
 * the database and the type system can never drift apart.
 */

export const PERMISSIONS = [
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
  {
    key: "CERTIFICATE_MANAGE",
    category: "administration",
    description: "Upload and manage the TLS certificate",
  },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];
