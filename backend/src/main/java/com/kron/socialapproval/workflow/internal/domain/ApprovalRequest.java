package com.kron.socialapproval.workflow.internal.domain;

import com.kron.socialapproval.platform.error.ApiException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.springframework.http.HttpStatus;

/**
 * One round of review over one exact version of a post.
 *
 * <p>A new round is created on every submission; rounds are never reopened. That is what lets the
 * timeline read as a true history rather than a mutable status field.
 */
@Entity
@Table(name = "approval_request")
public class ApprovalRequest {

    @Id
    private UUID id;

    @Column(name = "post_id", nullable = false)
    private UUID postId;

    @Column(name = "post_version_id", nullable = false)
    private UUID postVersionId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ApprovalStatus status = ApprovalStatus.PENDING;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ApprovalMode mode = ApprovalMode.ANY_ONE;

    @Column(name = "required_approvals", nullable = false)
    private int requiredApprovals = 1;

    @Column(name = "requested_by", nullable = false)
    private UUID requestedBy;

    @Column(name = "requested_at", nullable = false)
    private Instant requestedAt = Instant.now();

    @Column(name = "due_at", nullable = false)
    private Instant dueAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "sla_state", nullable = false)
    private SlaState slaState = SlaState.ON_TRACK;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "outcome_reason")
    private String outcomeReason;

    @Column(name = "escalation_level", nullable = false)
    private int escalationLevel;

    @Version
    @Column(name = "optimistic_version", nullable = false)
    private long optimisticVersion;

    protected ApprovalRequest() {
    }

    public static ApprovalRequest open(UUID id, UUID postId, UUID postVersionId, ApprovalMode mode,
                                       int requiredApprovals, UUID requestedBy, Instant now, Instant dueAt) {
        ApprovalRequest request = new ApprovalRequest();
        request.id = id;
        request.postId = postId;
        request.postVersionId = postVersionId;
        request.mode = mode;
        request.requiredApprovals = requiredApprovals;
        request.requestedBy = requestedBy;
        request.requestedAt = now;
        request.dueAt = dueAt;
        return request;
    }

    public void complete(ApprovalStatus outcome, String reason, Instant now) {
        if (!status.isOpen()) {
            throw new ApiException(HttpStatus.CONFLICT, "APPROVAL_ALREADY_DECIDED",
                    "A decision has already been recorded for this review round.");
        }
        this.status = outcome;
        this.outcomeReason = reason;
        this.completedAt = now;
    }

    public void cancel(Instant now) {
        this.status = ApprovalStatus.CANCELLED;
        this.completedAt = now;
    }

    /**
     * Recomputes where this round stands against its deadline. Returns true when the state moved,
     * so the caller knows whether a notification is owed.
     */
    public boolean refreshSla(Instant now, int warningThresholdPercent) {
        if (!status.isOpen()) {
            return false;
        }
        SlaState previous = slaState;
        if (now.isAfter(dueAt)) {
            slaState = SlaState.BREACHED;
        } else {
            Duration total = Duration.between(requestedAt, dueAt);
            Duration elapsed = Duration.between(requestedAt, now);
            double ratio = total.isZero() ? 1.0 : (double) elapsed.toSeconds() / total.toSeconds();
            slaState = ratio * 100 >= warningThresholdPercent ? SlaState.WARNING : SlaState.ON_TRACK;
        }
        return previous != slaState;
    }

    public void escalate() {
        this.escalationLevel++;
    }

    public UUID getId() {
        return id;
    }

    public UUID getPostId() {
        return postId;
    }

    public UUID getPostVersionId() {
        return postVersionId;
    }

    public ApprovalStatus getStatus() {
        return status;
    }

    public ApprovalMode getMode() {
        return mode;
    }

    public int getRequiredApprovals() {
        return requiredApprovals;
    }

    public UUID getRequestedBy() {
        return requestedBy;
    }

    public Instant getRequestedAt() {
        return requestedAt;
    }

    public Instant getDueAt() {
        return dueAt;
    }

    public SlaState getSlaState() {
        return slaState;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }

    public String getOutcomeReason() {
        return outcomeReason;
    }

    public int getEscalationLevel() {
        return escalationLevel;
    }

    public long getOptimisticVersion() {
        return optimisticVersion;
    }
}
