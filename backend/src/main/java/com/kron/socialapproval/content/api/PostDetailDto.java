package com.kron.socialapproval.content.api;

import com.kron.socialapproval.identity.api.UserSummary;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Everything the editor needs in one response.
 *
 * <p>{@code editable} and {@code submittable} are computed server-side rather than inferred by the
 * client from a status string: the rule about what may happen to a post lives in one place, and the
 * UI simply renders it.
 */
public record PostDetailDto(
        UUID id,
        String title,
        String bodyHtml,
        String bodyText,
        String status,
        String priority,
        ChannelDto channel,
        UserSummary author,
        int versionNo,
        List<AttachmentDto> attachments,
        String slaState,
        Instant dueAt,
        Instant submittedAt,
        Instant decidedAt,
        Instant createdAt,
        Instant updatedAt,
        long concurrencyToken,
        boolean editable,
        boolean submittable) {
}
