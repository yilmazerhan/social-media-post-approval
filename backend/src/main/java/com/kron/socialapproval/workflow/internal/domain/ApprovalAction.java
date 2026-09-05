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
 * Something that happened to a review round: a human verdict, or a workflow event such as an
 * assignment or an escalation.
 *
 * <p>Rows are immutable. A reviewer who changes their mind produces a new round, which is precisely
 * what the record should show.
 */
@Entity
@Table(name = "approval_action")
public class ApprovalAction {

    @Id
    private UUID id;

    @Column(name = "approval_request_id", nullable = false)
    private UUID approvalRequestId;

    /** Null for actions the system takes on the round rather than on one person's step. */
    @Column(name = "approval_step_id")
    private UUID approvalStepId;

    /** The exact content the actor saw. Without it, "approved" means nothing. */
    @Column(name = "post_version_id", nullable = false)
    private UUID postVersionId;

    @Column(name = "actor_id", nullable = false)
    private UUID actorId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ActionType action;

    @Column(columnDefinition = "text")
    private String note;

    @Column(name = "performed_at", nullable = false)
    private Instant performedAt = Instant.now();

    @Column(name = "ip_address")
    private String ipAddress;

    protected ApprovalAction() {
    }

    public static ApprovalAction decision(UUID id, UUID requestId, UUID stepId, UUID versionId, UUID actorId,
                                          DecisionType decision, String note, String ip, Instant now) {
        return of(id, requestId, stepId, versionId, actorId, ActionType.valueOf(decision.name()), note, ip, now);
    }

    public static ApprovalAction event(UUID id, UUID requestId, UUID versionId, UUID actorId,
                                       ActionType action, String note, Instant now) {
        return of(id, requestId, null, versionId, actorId, action, note, null, now);
    }

    private static ApprovalAction of(UUID id, UUID requestId, UUID stepId, UUID versionId, UUID actorId,
                                     ActionType action, String note, String ip, Instant now) {
        ApprovalAction recorded = new ApprovalAction();
        recorded.id = id;
        recorded.approvalRequestId = requestId;
        recorded.approvalStepId = stepId;
        recorded.postVersionId = versionId;
        recorded.actorId = actorId;
        recorded.action = action;
        recorded.note = note;
        recorded.ipAddress = ip;
        recorded.performedAt = now;
        return recorded;
    }

    /** True for the three actions that are a person's judgement rather than a workflow event. */
    public boolean isDecision() {
        return action.isDecision();
    }

    public DecisionType asDecision() {
        return DecisionType.valueOf(action.name());
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

    public UUID getActorId() {
        return actorId;
    }

    public ActionType getAction() {
        return action;
    }

    public String getNote() {
        return note;
    }

    public Instant getPerformedAt() {
        return performedAt;
    }
}
