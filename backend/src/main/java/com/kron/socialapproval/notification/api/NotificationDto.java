package com.kron.socialapproval.notification.api;

import java.time.Instant;
import java.util.UUID;

public record NotificationDto(
        UUID id,
        String type,
        String title,
        String body,
        String entityType,
        UUID entityId,
        String priority,
        boolean read,
        Instant createdAt) {
}
