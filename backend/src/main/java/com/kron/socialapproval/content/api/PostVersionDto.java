package com.kron.socialapproval.content.api;

import com.kron.socialapproval.identity.api.UserSummary;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record PostVersionDto(
        UUID id,
        int versionNo,
        String title,
        String bodyHtml,
        String bodyText,
        String reason,
        UserSummary createdBy,
        Instant createdAt,
        List<AttachmentDto> attachments) {
}
