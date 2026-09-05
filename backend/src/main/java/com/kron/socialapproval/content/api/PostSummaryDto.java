package com.kron.socialapproval.content.api;

import com.kron.socialapproval.identity.api.UserSummary;
import java.time.Instant;
import java.util.UUID;

/** A post as it appears in a list: enough to triage, not enough to review. */
public record PostSummaryDto(
        UUID id,
        String title,
        String excerpt,
        String status,
        String priority,
        ChannelDto channel,
        UserSummary author,
        int versionNo,
        int attachmentCount,
        String slaState,
        Instant dueAt,
        Instant submittedAt,
        Instant updatedAt,
        String aiRiskLevel,
        UserSummary awaitingDecisionFrom) {
}
