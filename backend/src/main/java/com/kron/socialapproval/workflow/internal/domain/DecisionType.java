package com.kron.socialapproval.workflow.internal.domain;

public enum DecisionType {
    APPROVE,
    REJECT,
    REQUEST_CHANGES;

    /** A decision that sends the post back needs the reviewer to say why. */
    public boolean requiresComment() {
        return this != APPROVE;
    }
}
