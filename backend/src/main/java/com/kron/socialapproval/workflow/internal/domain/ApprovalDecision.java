package com.kron.socialapproval.workflow.internal.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * A recorded human judgement. Immutable: a reviewer who changes their mind produces a new round,
 * which is precisely what the record should show.
 */
@Entity
@Table(name = "approval_decision")
public class ApprovalDecision {

    @Id
    private UUID id;

    @Column(name = "approval_request_id", nullable = false)
    private UUID approvalRequestId;

    @Column(name = "approval_step_id", nullable = false)
    private UUID approvalStepId;

    /** The exact content this person saw. Without it, "approved" means nothing. */
    @Column(name = "post_version_id", nullable = false)
    private UUID postVersionId;

    @Column(name = "decided_by", nullable = false)
    private UUID decidedBy;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private DecisionType decision;

    @Column(columnDefinition = "text")
    private String comment;

    @Column(name = "decided_at", nullable = false)
    private Instant decidedAt = Instant.now();

    @Column(name = "ip_address")
    private String ipAddress;

    protected ApprovalDecision() {
    }

    public static ApprovalDecision record(UUID id, UUID requestId, UUID stepId, UUID versionId, UUID decidedBy,
                                          DecisionType decision, String comment, String ip, Instant now) {
        ApprovalDecision recorded = new ApprovalDecision();
        recorded.id = id;
        recorded.approvalRequestId = requestId;
        recorded.approvalStepId = stepId;
        recorded.postVersionId = versionId;
        recorded.decidedBy = decidedBy;
        recorded.decision = decision;
        recorded.comment = comment;
        recorded.ipAddress = ip;
        recorded.decidedAt = now;
        return recorded;
    }

    public UUID getId() {
        return id;
    }

    public UUID getApprovalRequestId() {
        return approvalRequestId;
    }

    public UUID getPostVersionId() {
        return postVersionId;
    }

    public UUID getDecidedBy() {
        return decidedBy;
    }

    public DecisionType getDecision() {
        return decision;
    }

    public String getComment() {
        return comment;
    }

    public Instant getDecidedAt() {
        return decidedAt;
    }
}
