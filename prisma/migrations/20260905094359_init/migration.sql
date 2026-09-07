-- Required PostgreSQL extensions — see DATABASE.md §9.
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('LOCAL', 'ENTRA_ID');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED', 'LOCKED', 'PENDING');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ApprovalActionType" AS ENUM ('SUBMIT', 'ASSIGN', 'START_REVIEW', 'APPROVE', 'REJECT', 'REQUEST_CHANGES', 'RESUBMIT', 'CANCEL', 'REASSIGN');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "ApproverTargetType" AS ENUM ('USER', 'GROUP', 'DEPARTMENT_MANAGER');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "AttachmentStatus" AS ENUM ('TEMPORARY', 'ATTACHED', 'ORPHANED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('POST_SUBMITTED', 'APPROVAL_ASSIGNED', 'CHANGES_REQUESTED', 'POST_APPROVED', 'POST_REJECTED', 'COMMENT_MENTION', 'COMMENT_ADDED', 'SLA_WARNING', 'SLA_OVERDUE', 'ESCALATION');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('EMAIL_SEND', 'DAILY_DIGEST', 'SLA_CHECK', 'SLA_ESCALATE', 'RETENTION_CLEANUP', 'ORPHAN_ATTACHMENT_CLEANUP', 'TEMP_FILE_CLEANUP', 'SESSION_CLEANUP', 'NOTIFICATION_FANOUT');

-- CreateEnum
CREATE TYPE "RetentionTarget" AS ENUM ('POST', 'ATTACHMENT', 'COMMENT', 'NOTIFICATION', 'EMAIL_LOG', 'AUDIT_LOG', 'BACKGROUND_JOB', 'SESSION');

-- CreateEnum
CREATE TYPE "SettingType" AS ENUM ('STRING', 'INT', 'BOOL', 'JSON', 'DURATION_MINUTES', 'TIME_OF_DAY');

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "grantedById" UUID,
    "grantedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "managerId" UUID,
    "parentId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isApprovalGroup" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserGroup" (
    "userId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "addedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserGroup_pkey" PRIMARY KEY ("userId","groupId")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "jobTitle" TEXT,
    "departmentId" UUID,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "authProvider" "AuthProvider" NOT NULL,
    "externalIdentityId" TEXT,
    "passwordHash" TEXT,
    "passwordUpdatedAt" TIMESTAMPTZ(6),
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(6),
    "timezone" TEXT,
    "lastLoginAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "revokedAt" TIMESTAMPTZ(6),
    "revokedReason" TEXT,
    "ipAddress" INET,
    "userAgent" TEXT,
    "authProvider" "AuthProvider" NOT NULL,
    "samlSessionIndex" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "usedAt" TIMESTAMPTZ(6),
    "requestedIp" INET,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" BIGSERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "userId" UUID,
    "successful" BOOLEAN NOT NULL,
    "ipAddress" INET,
    "userAgent" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SamlReplayGuard" (
    "assertionId" TEXT NOT NULL,
    "notOnOrAfter" TIMESTAMPTZ(6) NOT NULL,
    "consumedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SamlReplayGuard_pkey" PRIMARY KEY ("assertionId")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "creatorId" UUID NOT NULL,
    "departmentId" UUID,
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "status" "PostStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersionId" UUID,
    "approvedVersionId" UUID,
    "draftTitle" TEXT,
    "draftContentJson" JSONB,
    "draftUpdatedAt" TIMESTAMPTZ(6),
    "approvalRouteId" UUID,
    "requestedApproverId" UUID,
    "requestedGroupId" UUID,
    "slaPolicyId" UUID,
    "submittedAt" TIMESTAMPTZ(6),
    "firstReviewedAt" TIMESTAMPTZ(6),
    "decidedAt" TIMESTAMPTZ(6),
    "dueAt" TIMESTAMPTZ(6),
    "rejectionReason" TEXT,
    "lockVersion" INTEGER NOT NULL DEFAULT 0,
    "retentionEligibleAt" TIMESTAMPTZ(6),
    "archivedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),
    "searchVector" tsvector,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostVersion" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "contentJson" JSONB NOT NULL,
    "contentHtml" TEXT NOT NULL,
    "contentText" TEXT NOT NULL,
    "characterCount" INTEGER NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMPTZ(6),
    "changeSummary" TEXT,
    "supersedesVersionId" UUID,

    CONSTRAINT "PostVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "sanitizedFilename" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationSeconds" INTEGER,
    "videoCodec" TEXT,
    "thumbnailKey" TEXT,
    "posterKey" TEXT,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'TEMPORARY',
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attachedAt" TIMESTAMPTZ(6),
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostVersionAttachment" (
    "postVersionId" UUID NOT NULL,
    "attachmentId" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "PostVersionAttachment_pkey" PRIMARY KEY ("postVersionId","attachmentId")
);

-- CreateTable
CREATE TABLE "ApprovalRule" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priorityOrder" INTEGER NOT NULL,
    "departmentId" UUID,
    "priority" "Priority",
    "creatorGroupId" UUID,
    "targetType" "ApproverTargetType" NOT NULL,
    "targetUserId" UUID,
    "targetGroupId" UUID,
    "slaPolicyId" UUID,
    "allowCreatorOverride" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ApprovalRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalAssignment" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "postVersionId" UUID NOT NULL,
    "assigneeUserId" UUID,
    "assigneeGroupId" UUID,
    "assignedById" UUID,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "ruleId" UUID,
    "dueAt" TIMESTAMPTZ(6),
    "warningAt" TIMESTAMPTZ(6),
    "assignedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),
    "escalatedAt" TIMESTAMPTZ(6),
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ApprovalAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalAction" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "postVersionId" UUID NOT NULL,
    "assignmentId" UUID,
    "actorId" UUID NOT NULL,
    "action" "ApprovalActionType" NOT NULL,
    "comment" TEXT,
    "previousStatus" "PostStatus" NOT NULL,
    "newStatus" "PostStatus" NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "ApprovalAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlaPolicy" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "priority" "Priority",
    "departmentId" UUID,
    "durationMinutes" INTEGER NOT NULL,
    "warningThresholdPercent" INTEGER NOT NULL DEFAULT 75,
    "businessHoursOnly" BOOLEAN NOT NULL DEFAULT false,
    "escalationAfterMinutes" INTEGER,
    "escalationTargetType" "ApproverTargetType",
    "escalationUserId" UUID,
    "escalationGroupId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SlaPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "postVersionId" UUID,
    "authorId" UUID NOT NULL,
    "parentId" UUID,
    "body" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentMention" (
    "commentId" UUID NOT NULL,
    "mentionedUserId" UUID NOT NULL,

    CONSTRAINT "CommentMention_pkey" PRIMARY KEY ("commentId","mentionedUserId")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "postId" UUID,
    "actorId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMPTZ(6),
    "emailJobId" BIGINT,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subjectTemplate" TEXT NOT NULL,
    "bodyTemplate" TEXT NOT NULL,
    "isHtml" BOOLEAN NOT NULL DEFAULT true,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" BIGSERIAL NOT NULL,
    "templateKey" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "ccAddress" TEXT,
    "subject" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "jobId" BIGINT,
    "postId" UUID,
    "userId" UUID,
    "idempotencyKey" TEXT,
    "queuedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ(6),

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackgroundJob" (
    "id" BIGSERIAL NOT NULL,
    "type" "JobType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "scheduledAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),
    "lockedBy" TEXT,
    "lockedAt" TIMESTAMPTZ(6),
    "lastError" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSchedule" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "jobType" "JobType" NOT NULL,
    "cronExpression" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "payload" JSONB,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastEnqueuedSlot" TEXT,
    "lastRunAt" TIMESTAMPTZ(6),
    "nextRunAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "JobSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionPolicy" (
    "id" UUID NOT NULL,
    "target" "RetentionTarget" NOT NULL,
    "retentionDays" INTEGER NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMPTZ(6),
    "description" TEXT,
    "updatedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "RetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionRun" (
    "id" BIGSERIAL NOT NULL,
    "target" "RetentionTarget" NOT NULL,
    "dryRun" BOOLEAN NOT NULL,
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(6),
    "candidateCount" INTEGER NOT NULL DEFAULT 0,
    "deletedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "freedBytes" BIGINT,
    "error" TEXT,
    "details" JSONB,

    CONSTRAINT "RetentionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "actorId" UUID,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "postId" UUID,
    "ipAddress" INET,
    "userAgent" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT,
    "type" "SettingType" NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" UUID,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- CreateIndex
CREATE INDEX "UserRole_grantedById_idx" ON "UserRole"("grantedById");

-- CreateIndex
CREATE UNIQUE INDEX "Department_key_key" ON "Department"("key");

-- CreateIndex
CREATE INDEX "Department_managerId_idx" ON "Department"("managerId");

-- CreateIndex
CREATE INDEX "Department_parentId_idx" ON "Department"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Group_key_key" ON "Group"("key");

-- CreateIndex
CREATE INDEX "UserGroup_groupId_idx" ON "UserGroup"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_email_createdAt_idx" ON "LoginAttempt"("email", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "LoginAttempt_ipAddress_createdAt_idx" ON "LoginAttempt"("ipAddress", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "LoginAttempt_userId_idx" ON "LoginAttempt"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Post_reference_key" ON "Post"("reference");

-- CreateIndex
CREATE INDEX "Post_creatorId_status_updatedAt_idx" ON "Post"("creatorId", "status", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "Post_status_dueAt_idx" ON "Post"("status", "dueAt");

-- CreateIndex
CREATE INDEX "Post_departmentId_status_idx" ON "Post"("departmentId", "status");

-- CreateIndex
CREATE INDEX "Post_priority_dueAt_idx" ON "Post"("priority", "dueAt");

-- CreateIndex
CREATE INDEX "Post_currentVersionId_idx" ON "Post"("currentVersionId");

-- CreateIndex
CREATE INDEX "Post_approvedVersionId_idx" ON "Post"("approvedVersionId");

-- CreateIndex
CREATE INDEX "Post_approvalRouteId_idx" ON "Post"("approvalRouteId");

-- CreateIndex
CREATE INDEX "Post_requestedApproverId_idx" ON "Post"("requestedApproverId");

-- CreateIndex
CREATE INDEX "Post_requestedGroupId_idx" ON "Post"("requestedGroupId");

-- CreateIndex
CREATE INDEX "Post_slaPolicyId_idx" ON "Post"("slaPolicyId");

-- CreateIndex
CREATE INDEX "PostVersion_postId_idx" ON "PostVersion"("postId");

-- CreateIndex
CREATE INDEX "PostVersion_createdById_idx" ON "PostVersion"("createdById");

-- CreateIndex
CREATE INDEX "PostVersion_supersedesVersionId_idx" ON "PostVersion"("supersedesVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "PostVersion_postId_versionNumber_key" ON "PostVersion"("postId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");

-- CreateIndex
CREATE INDEX "Attachment_status_createdAt_idx" ON "Attachment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Attachment_uploadedById_idx" ON "Attachment"("uploadedById");

-- CreateIndex
CREATE INDEX "Attachment_checksumSha256_idx" ON "Attachment"("checksumSha256");

-- CreateIndex
CREATE INDEX "PostVersionAttachment_attachmentId_idx" ON "PostVersionAttachment"("attachmentId");

-- CreateIndex
CREATE INDEX "ApprovalRule_isActive_priorityOrder_idx" ON "ApprovalRule"("isActive", "priorityOrder");

-- CreateIndex
CREATE INDEX "ApprovalRule_departmentId_idx" ON "ApprovalRule"("departmentId");

-- CreateIndex
CREATE INDEX "ApprovalRule_creatorGroupId_idx" ON "ApprovalRule"("creatorGroupId");

-- CreateIndex
CREATE INDEX "ApprovalRule_targetUserId_idx" ON "ApprovalRule"("targetUserId");

-- CreateIndex
CREATE INDEX "ApprovalRule_targetGroupId_idx" ON "ApprovalRule"("targetGroupId");

-- CreateIndex
CREATE INDEX "ApprovalRule_slaPolicyId_idx" ON "ApprovalRule"("slaPolicyId");

-- CreateIndex
CREATE INDEX "ApprovalAssignment_assigneeUserId_status_dueAt_idx" ON "ApprovalAssignment"("assigneeUserId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "ApprovalAssignment_status_warningAt_idx" ON "ApprovalAssignment"("status", "warningAt");

-- CreateIndex
CREATE INDEX "ApprovalAssignment_status_dueAt_idx" ON "ApprovalAssignment"("status", "dueAt");

-- CreateIndex
CREATE INDEX "ApprovalAssignment_postId_idx" ON "ApprovalAssignment"("postId");

-- CreateIndex
CREATE INDEX "ApprovalAssignment_postVersionId_idx" ON "ApprovalAssignment"("postVersionId");

-- CreateIndex
CREATE INDEX "ApprovalAssignment_assigneeGroupId_idx" ON "ApprovalAssignment"("assigneeGroupId");

-- CreateIndex
CREATE INDEX "ApprovalAssignment_assignedById_idx" ON "ApprovalAssignment"("assignedById");

-- CreateIndex
CREATE INDEX "ApprovalAssignment_ruleId_idx" ON "ApprovalAssignment"("ruleId");

-- CreateIndex
CREATE INDEX "ApprovalAction_postId_createdAt_idx" ON "ApprovalAction"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "ApprovalAction_actorId_createdAt_idx" ON "ApprovalAction"("actorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ApprovalAction_action_createdAt_idx" ON "ApprovalAction"("action", "createdAt");

-- CreateIndex
CREATE INDEX "ApprovalAction_postVersionId_idx" ON "ApprovalAction"("postVersionId");

-- CreateIndex
CREATE INDEX "ApprovalAction_assignmentId_idx" ON "ApprovalAction"("assignmentId");

-- CreateIndex
CREATE INDEX "SlaPolicy_departmentId_priority_idx" ON "SlaPolicy"("departmentId", "priority");

-- CreateIndex
CREATE INDEX "SlaPolicy_escalationUserId_idx" ON "SlaPolicy"("escalationUserId");

-- CreateIndex
CREATE INDEX "SlaPolicy_escalationGroupId_idx" ON "SlaPolicy"("escalationGroupId");

-- CreateIndex
CREATE INDEX "Comment_postId_createdAt_idx" ON "Comment"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");

-- CreateIndex
CREATE INDEX "Comment_postVersionId_idx" ON "Comment"("postVersionId");

-- CreateIndex
CREATE INDEX "Comment_authorId_idx" ON "Comment"("authorId");

-- CreateIndex
CREATE INDEX "CommentMention_mentionedUserId_idx" ON "CommentMention"("mentionedUserId");

-- CreateIndex
CREATE INDEX "Notification_recipientId_readAt_createdAt_idx" ON "Notification"("recipientId", "readAt", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Notification_postId_idx" ON "Notification"("postId");

-- CreateIndex
CREATE INDEX "Notification_actorId_idx" ON "Notification"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_key_key" ON "EmailTemplate"("key");

-- CreateIndex
CREATE INDEX "EmailTemplate_updatedById_idx" ON "EmailTemplate"("updatedById");

-- CreateIndex
CREATE UNIQUE INDEX "EmailLog_idempotencyKey_key" ON "EmailLog"("idempotencyKey");

-- CreateIndex
CREATE INDEX "EmailLog_status_queuedAt_idx" ON "EmailLog"("status", "queuedAt");

-- CreateIndex
CREATE INDEX "EmailLog_toAddress_queuedAt_idx" ON "EmailLog"("toAddress", "queuedAt");

-- CreateIndex
CREATE INDEX "EmailLog_postId_idx" ON "EmailLog"("postId");

-- CreateIndex
CREATE INDEX "EmailLog_userId_idx" ON "EmailLog"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BackgroundJob_idempotencyKey_key" ON "BackgroundJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "BackgroundJob_status_scheduledAt_priority_idx" ON "BackgroundJob"("status", "scheduledAt", "priority");

-- CreateIndex
CREATE INDEX "BackgroundJob_status_lockedAt_idx" ON "BackgroundJob"("status", "lockedAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobSchedule_key_key" ON "JobSchedule"("key");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionPolicy_target_key" ON "RetentionPolicy"("target");

-- CreateIndex
CREATE INDEX "RetentionPolicy_updatedById_idx" ON "RetentionPolicy"("updatedById");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_postId_idx" ON "AuditLog"("postId");

-- CreateIndex
CREATE INDEX "SystemSetting_updatedById_idx" ON "SystemSetting"("updatedById");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGroup" ADD CONSTRAINT "UserGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGroup" ADD CONSTRAINT "UserGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoginAttempt" ADD CONSTRAINT "LoginAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "PostVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_approvedVersionId_fkey" FOREIGN KEY ("approvedVersionId") REFERENCES "PostVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_approvalRouteId_fkey" FOREIGN KEY ("approvalRouteId") REFERENCES "ApprovalRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_requestedApproverId_fkey" FOREIGN KEY ("requestedApproverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_requestedGroupId_fkey" FOREIGN KEY ("requestedGroupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_slaPolicyId_fkey" FOREIGN KEY ("slaPolicyId") REFERENCES "SlaPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostVersion" ADD CONSTRAINT "PostVersion_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostVersion" ADD CONSTRAINT "PostVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostVersion" ADD CONSTRAINT "PostVersion_supersedesVersionId_fkey" FOREIGN KEY ("supersedesVersionId") REFERENCES "PostVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostVersionAttachment" ADD CONSTRAINT "PostVersionAttachment_postVersionId_fkey" FOREIGN KEY ("postVersionId") REFERENCES "PostVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostVersionAttachment" ADD CONSTRAINT "PostVersionAttachment_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRule" ADD CONSTRAINT "ApprovalRule_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRule" ADD CONSTRAINT "ApprovalRule_creatorGroupId_fkey" FOREIGN KEY ("creatorGroupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRule" ADD CONSTRAINT "ApprovalRule_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRule" ADD CONSTRAINT "ApprovalRule_targetGroupId_fkey" FOREIGN KEY ("targetGroupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRule" ADD CONSTRAINT "ApprovalRule_slaPolicyId_fkey" FOREIGN KEY ("slaPolicyId") REFERENCES "SlaPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalAssignment" ADD CONSTRAINT "ApprovalAssignment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalAssignment" ADD CONSTRAINT "ApprovalAssignment_postVersionId_fkey" FOREIGN KEY ("postVersionId") REFERENCES "PostVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalAssignment" ADD CONSTRAINT "ApprovalAssignment_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalAssignment" ADD CONSTRAINT "ApprovalAssignment_assigneeGroupId_fkey" FOREIGN KEY ("assigneeGroupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalAssignment" ADD CONSTRAINT "ApprovalAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalAssignment" ADD CONSTRAINT "ApprovalAssignment_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ApprovalRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalAction" ADD CONSTRAINT "ApprovalAction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalAction" ADD CONSTRAINT "ApprovalAction_postVersionId_fkey" FOREIGN KEY ("postVersionId") REFERENCES "PostVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalAction" ADD CONSTRAINT "ApprovalAction_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ApprovalAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalAction" ADD CONSTRAINT "ApprovalAction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlaPolicy" ADD CONSTRAINT "SlaPolicy_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlaPolicy" ADD CONSTRAINT "SlaPolicy_escalationUserId_fkey" FOREIGN KEY ("escalationUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlaPolicy" ADD CONSTRAINT "SlaPolicy_escalationGroupId_fkey" FOREIGN KEY ("escalationGroupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_postVersionId_fkey" FOREIGN KEY ("postVersionId") REFERENCES "PostVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentMention" ADD CONSTRAINT "CommentMention_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentMention" ADD CONSTRAINT "CommentMention_mentionedUserId_fkey" FOREIGN KEY ("mentionedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionPolicy" ADD CONSTRAINT "RetentionPolicy_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemSetting" ADD CONSTRAINT "SystemSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =========================================================================
-- Additions Prisma's schema language cannot express — see DATABASE.md §9.
-- Database role grants (append-only enforcement for a separate restricted
-- runtime role) are deliberately NOT included here: they depend on a
-- production role that does not exist in dev/CI, and are addressed as
-- part of Phase 25 (Security hardening) / DEPLOYMENT.md instead.
-- =========================================================================

-- ---- CHECK constraints -----------------------------------------------

ALTER TABLE "User" ADD CONSTRAINT "user_local_has_password_or_pending"
  CHECK ("authProvider" <> 'LOCAL' OR "passwordHash" IS NOT NULL OR "status" = 'PENDING');

ALTER TABLE "User" ADD CONSTRAINT "user_entra_has_no_password"
  CHECK ("authProvider" <> 'ENTRA_ID' OR "passwordHash" IS NULL);

ALTER TABLE "ApprovalAssignment" ADD CONSTRAINT "approval_assignment_one_target"
  CHECK (
    ("assigneeUserId" IS NOT NULL AND "assigneeGroupId" IS NULL)
    OR ("assigneeUserId" IS NULL AND "assigneeGroupId" IS NOT NULL)
  );

ALTER TABLE "ApprovalAction" ADD CONSTRAINT "approval_action_comment_required"
  CHECK (
    "action" NOT IN ('REQUEST_CHANGES', 'REJECT')
    OR (COALESCE(BTRIM("comment"), '') <> '')
  );

-- ---- Partial unique indexes --------------------------------------------

-- At most one open (pending/in-progress) assignment per post.
CREATE UNIQUE INDEX "approval_assignment_one_open_per_post"
  ON "ApprovalAssignment" ("postId")
  WHERE "status" IN ('PENDING', 'IN_PROGRESS');

-- SlaPolicy resolution order: department+priority -> priority -> global
-- default. Each tier is unique on its own terms; a plain composite unique
-- constraint can't express "unique except when null", since Postgres
-- already treats NULL as distinct from NULL there.
CREATE UNIQUE INDEX "sla_policy_dept_priority"
  ON "SlaPolicy" ("departmentId", "priority")
  WHERE "departmentId" IS NOT NULL AND "priority" IS NOT NULL;

CREATE UNIQUE INDEX "sla_policy_priority_only"
  ON "SlaPolicy" ("priority")
  WHERE "departmentId" IS NULL AND "priority" IS NOT NULL;

CREATE UNIQUE INDEX "sla_policy_global_default"
  ON "SlaPolicy" ((1))
  WHERE "departmentId" IS NULL AND "priority" IS NULL;

-- ---- Trigram indexes for fast name/email lookups -----------------------

CREATE INDEX "user_display_name_trgm_idx" ON "User" USING GIN ("displayName" gin_trgm_ops);
CREATE INDEX "user_email_trgm_idx" ON "User" USING GIN (("email"::text) gin_trgm_ops);

-- ---- Full-text search over posts ---------------------------------------
--
-- PostVersion is immutable (no UPDATE is ever issued against it — see
-- DATABASE.md §4), so the only way a post's searchable text changes is
-- title editing or currentVersionId moving to a different version. A
-- BEFORE trigger that sets NEW directly (rather than issuing a separate
-- UPDATE) avoids any risk of trigger recursion.

CREATE FUNCTION update_post_search_vector() RETURNS trigger AS $$
DECLARE
  version_text TEXT;
BEGIN
  IF NEW."currentVersionId" IS NOT NULL THEN
    SELECT "contentText" INTO version_text
    FROM "PostVersion" WHERE "id" = NEW."currentVersionId";
  END IF;

  NEW."searchVector" :=
    setweight(to_tsvector('english', COALESCE(NEW."title", '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(version_text, '')), 'B');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER post_search_vector_update
  BEFORE INSERT OR UPDATE OF "title", "currentVersionId" ON "Post"
  FOR EACH ROW EXECUTE FUNCTION update_post_search_vector();

CREATE INDEX "post_search_vector_idx" ON "Post" USING GIN ("searchVector");
