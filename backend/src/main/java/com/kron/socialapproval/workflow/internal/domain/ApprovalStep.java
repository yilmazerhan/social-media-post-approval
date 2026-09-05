package com.kron.socialapproval.workflow.internal.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** One named person's part in a review round. */
@Entity
@Table(name = "approval_step")
public class ApprovalStep {

    @Id
    private UUID id;

    @Column(name = "approval_request_id", nullable = false)
    private UUID approvalRequestId;

    @Column(name = "step_no", nullable = false)
    private int stepNo;

    @Column(name = "assignee_id", nullable = false)
    private UUID assigneeId;

    @Column(name = "assigned_by")
    private UUID assignedBy;

    @Column(name = "assigned_at", nullable = false)
    private Instant assignedAt = Instant.now();

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private StepStatus status = StepStatus.PENDING;

    @Column(name = "notified_at")
    private Instant notifiedAt;

    @Column(name = "reminded_at")
    private Instant remindedAt;

    protected ApprovalStep() {
    }

    public static ApprovalStep assign(UUID id, UUID requestId, int stepNo, UUID assigneeId,
                                      UUID assignedBy, Instant now) {
        ApprovalStep step = new ApprovalStep();
        step.id = id;
        step.approvalRequestId = requestId;
        step.stepNo = stepNo;
        step.assigneeId = assigneeId;
        step.assignedBy = assignedBy;
        step.assignedAt = now;
        return step;
    }

    public void complete() {
        this.status = StepStatus.COMPLETED;
    }

    public void skip() {
        if (status == StepStatus.PENDING) {
            this.status = StepStatus.SKIPPED;
        }
    }

    public void markNotified(Instant now) {
        this.notifiedAt = now;
    }

    public UUID getId() {
        return id;
    }

    public UUID getApprovalRequestId() {
        return approvalRequestId;
    }

    public int getStepNo() {
        return stepNo;
    }

    public UUID getAssigneeId() {
        return assigneeId;
    }

    public Instant getAssignedAt() {
        return assignedAt;
    }

    public StepStatus getStatus() {
        return status;
    }
}
