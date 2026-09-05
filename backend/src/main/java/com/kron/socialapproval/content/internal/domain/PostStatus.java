package com.kron.socialapproval.content.internal.domain;

import java.util.EnumSet;
import java.util.Set;

/**
 * The post lifecycle of ARCHITECTURE.md section 16.1.
 *
 * <p>Two invariants live here rather than in a service, because they are what make the audit trail
 * mean anything: content is frozen while {@link #IN_REVIEW}, and any edit after approval sends the
 * post back to {@link #DRAFT} so the approval cannot outlive the bytes it was given for.
 */
public enum PostStatus {

    DRAFT,
    IN_REVIEW,
    CHANGES_REQUESTED,
    APPROVED,
    REJECTED,
    SCHEDULED,
    PUBLISHED,
    ARCHIVED,
    EXPIRED;

    private static final Set<PostStatus> EDITABLE = EnumSet.of(DRAFT, CHANGES_REQUESTED, REJECTED);

    public boolean isEditable() {
        return EDITABLE.contains(this);
    }

    public boolean isSubmittable() {
        return EDITABLE.contains(this);
    }

    public boolean isAwaitingDecision() {
        return this == IN_REVIEW;
    }

    /** True while the author still owns the content and reviewers are not waiting on it. */
    public boolean isWithAuthor() {
        return this == DRAFT || this == CHANGES_REQUESTED || this == REJECTED;
    }
}
