package com.kron.socialapproval.collaboration.api;

import com.kron.socialapproval.identity.api.UserSummary;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record CommentDto(
        UUID id,
        UUID postId,
        UUID parentCommentId,
        UserSummary author,
        String body,
        boolean internal,
        Instant createdAt,
        Instant editedAt,
        List<CommentDto> replies) {
}
