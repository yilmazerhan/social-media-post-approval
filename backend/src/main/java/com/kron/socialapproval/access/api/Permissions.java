package com.kron.socialapproval.access.api;

/**
 * The permission codes used in {@code @PreAuthorize} expressions, in one place so a typo is a
 * compile error rather than an endpoint that silently allows everyone.
 */
public final class Permissions {

    public static final String POST_CREATE = "post:create";
    public static final String POST_READ_OWN = "post:read:own";
    public static final String POST_READ_ASSIGNED = "post:read:assigned";
    public static final String POST_READ_ALL = "post:read:all";
    public static final String POST_UPDATE_OWN = "post:update:own";
    public static final String POST_UPDATE_ANY = "post:update:any";
    public static final String POST_SUBMIT = "post:submit";
    public static final String POST_WITHDRAW = "post:withdraw";
    public static final String POST_DELETE_OWN = "post:delete:own";

    public static final String APPROVAL_READ_ASSIGNED = "approval:read:assigned";
    public static final String APPROVAL_READ_ALL = "approval:read:all";
    public static final String APPROVAL_DECIDE = "approval:decide";
    public static final String APPROVAL_ASSIGN = "approval:assign";

    public static final String COMMENT_CREATE = "comment:create";
    public static final String COMMENT_READ = "comment:read";

    public static final String ATTACHMENT_UPLOAD = "attachment:upload";
    public static final String ATTACHMENT_DOWNLOAD = "attachment:download";
    public static final String ATTACHMENT_DELETE = "attachment:delete";

    public static final String NOTIFICATION_READ_OWN = "notification:read:own";

    public static final String AI_REVIEW_RUN = "ai:review:run";
    public static final String AI_REVIEW_READ = "ai:review:read";
    public static final String AI_FINDING_RESOLVE = "ai:finding:resolve";

    public static final String USER_READ = "user:read";

    private Permissions() {
    }
}
