package com.kron.socialapproval.notification.api;

import java.util.UUID;

/**
 * How other modules tell someone that something happened to them.
 *
 * <p>Notifications are written in the same transaction as the change that caused them, so a person
 * is never told about a decision that was rolled back, and a committed decision is never silent.
 */
public interface NotificationPublisher {

    void notify(UUID userId, String type, String title, String body, String entityType, UUID entityId,
                String priority);
}
