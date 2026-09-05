package com.kron.socialapproval.ai.api;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * The result of an advisory content check.
 *
 * <p>{@code status} matters as much as the findings: a review that was skipped because the provider
 * was unavailable must be visibly different from one that ran and found nothing, or the screen
 * would be claiming a check it never performed.
 */
public record AiReviewDto(
        UUID id,
        UUID postId,
        UUID postVersionId,
        String provider,
        String model,
        String status,
        String riskLevel,
        Integer riskScore,
        String summary,
        Integer latencyMs,
        String error,
        Instant createdAt,
        Instant completedAt,
        List<AiFindingDto> findings) {

    public record AiFindingDto(
            UUID id,
            String category,
            String severity,
            String title,
            String excerpt,
            String explanation,
            String suggestion,
            boolean acknowledged,
            boolean dismissed) {
    }
}
