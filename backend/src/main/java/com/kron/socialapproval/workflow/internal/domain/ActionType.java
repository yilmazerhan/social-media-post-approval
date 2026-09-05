package com.kron.socialapproval.workflow.internal.domain;

import java.util.EnumSet;
import java.util.Set;

/** Everything that can be recorded against a review round. */
public enum ActionType {
    SUBMITTED,
    ASSIGNED,
    REASSIGNED,
    APPROVE,
    REJECT,
    REQUEST_CHANGES,
    ESCALATED,
    WITHDRAWN,
    EXPIRED;

    private static final Set<ActionType> DECISIONS = EnumSet.of(APPROVE, REJECT, REQUEST_CHANGES);

    public boolean isDecision() {
        return DECISIONS.contains(this);
    }
}
