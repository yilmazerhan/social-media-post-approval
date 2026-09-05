package com.kron.socialapproval.workflow.internal.domain;

public enum ApprovalStatus {
    PENDING,
    APPROVED,
    REJECTED,
    CHANGES_REQUESTED,
    CANCELLED,
    EXPIRED;

    public boolean isOpen() {
        return this == PENDING;
    }
}
