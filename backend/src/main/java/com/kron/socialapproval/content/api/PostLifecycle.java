package com.kron.socialapproval.content.api;

import java.time.Instant;
import java.util.UUID;

/**
 * State transitions the workflow module drives on behalf of an approval.
 *
 * <p>The dependency points one way — workflow depends on content, never the reverse — so a post can
 * exist without an approval but an approval can never exist without a post.
 */
public interface PostLifecycle {

    /** Freezes the current content as a new immutable version and moves the post into review. */
    SubmissionSnapshot submitForReview(UUID postId, UUID actorId, Instant dueAt);

    void applyDecision(UUID postId, DecisionOutcome outcome, UUID actorId);

    void withdrawFromReview(UUID postId, UUID actorId);

    /** Identifies the exact version an approver is being asked to judge. */
    record SubmissionSnapshot(UUID postVersionId, int versionNo, String title) {
    }

    enum DecisionOutcome {
        APPROVED,
        REJECTED,
        CHANGES_REQUESTED
    }
}
