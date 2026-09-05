package com.kron.socialapproval.content.api;

import java.time.Instant;
import java.util.UUID;

public record AttachmentDto(
        UUID id,
        String kind,
        String filename,
        String contentType,
        long sizeBytes,
        String status,
        String statusDetail,
        Integer width,
        Integer height,
        Integer durationSeconds,
        String altText,
        String caption,
        int sortOrder,
        String contentUrl,
        Instant createdAt) {
}
