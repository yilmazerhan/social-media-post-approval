package com.kron.socialapproval.workflow.api;

import com.kron.socialapproval.ai.api.AiReviewDto;
import com.kron.socialapproval.collaboration.api.CommentDto;
import com.kron.socialapproval.content.api.PostDetailDto;
import com.kron.socialapproval.content.api.PostVersionDto;
import com.kron.socialapproval.identity.api.UserSummary;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * The shapes the approval screens consume.
 *
 * <p>{@link ApprovalReview} is deliberately one large response. A reviewer should not have to visit
 * four screens to understand a post, so the server assembles content, version, findings, history
 * and discussion in a single round trip (ARCHITECTURE.md hero screen requirements).
 */
public final class ApprovalDtos {

    private ApprovalDtos() {
    }

    /** A row in the approver's queue. */
    public record ApprovalSummary(
            UUID approvalId,
            UUID postId,
            String postTitle,
            String excerpt,
            String postStatus,
            String priority,
            String channelName,
            UserSummary author,
            int versionNo,
            int attachmentCount,
            Instant requestedAt,
            Instant dueAt,
            String slaState,
            long secondsRemaining,
            boolean overdue,
            String aiRiskLevel,
            String aiStatus,
            boolean decidedByMe) {
    }

    public record Assignee(UserSummary user, String stepStatus, Instant assignedAt, boolean isMe) {
    }

    public record Decision(
            UUID id,
            UserSummary decidedBy,
            String decision,
            String comment,
            int versionNo,
            Instant decidedAt) {
    }

    /** One entry in the review history. Actor, action, version and time — nothing else. */
    public record TimelineEntry(
            Instant at,
            UserSummary actor,
            String action,
            Integer versionNo,
            String detail) {
    }

    public record ApprovalHeader(
            UUID id,
            String status,
            String mode,
            int requiredApprovals,
            UserSummary requestedBy,
            Instant requestedAt,
            Instant dueAt,
            String slaState,
            long secondsRemaining,
            boolean overdue,
            int escalationLevel,
            int versionNo,
            UUID postVersionId,
            long concurrencyToken) {
    }

    /**
     * What this particular viewer may do, computed server-side. The UI renders from these flags and
     * never infers a permission from a role name.
     */
    public record ViewerContext(
            boolean canDecide,
            boolean isAssignedApprover,
            boolean isAuthor,
            boolean alreadyDecided,
            boolean commentRequiredForRejection) {
    }

    public record ApprovalReview(
            ApprovalHeader approval,
            PostDetailDto post,
            PostVersionDto version,
            List<Assignee> assignees,
            List<Decision> decisions,
            List<TimelineEntry> timeline,
            AiReviewDto aiReview,
            List<CommentDto> comments,
            ViewerContext viewer,
            List<Integer> availableVersions) {
    }

    /** Lets a reviewer move through the queue without going back to it. */
    public record Neighbours(UUID previousApprovalId, UUID nextApprovalId, int position, int total) {
    }
}
