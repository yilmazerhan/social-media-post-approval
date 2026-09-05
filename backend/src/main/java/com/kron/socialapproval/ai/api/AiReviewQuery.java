package com.kron.socialapproval.ai.api;

import java.util.Optional;
import java.util.UUID;

/** Read access to AI findings for the screens that display them. */
public interface AiReviewQuery {

    Optional<AiReviewDto> latestForPost(UUID postId);

    Optional<AiReviewDto> forVersion(UUID postVersionId);
}
