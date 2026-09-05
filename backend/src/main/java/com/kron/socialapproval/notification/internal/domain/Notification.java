package com.kron.socialapproval.notification.internal.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "notification")
public class Notification {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false)
    private String type;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "text")
    private String body;

    @Column(name = "entity_type")
    private String entityType;

    @Column(name = "entity_id")
    private UUID entityId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false)
    private String data = "{}";

    @Column(nullable = false)
    private String priority = "NORMAL";

    @Column(name = "read_at")
    private Instant readAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    protected Notification() {
    }

    public static Notification of(UUID id, UUID userId, String type, String title, String body,
                                  String entityType, UUID entityId, String priority, Instant now) {
        Notification notification = new Notification();
        notification.id = id;
        notification.userId = userId;
        notification.type = type;
        notification.title = title;
        notification.body = body;
        notification.entityType = entityType;
        notification.entityId = entityId;
        notification.priority = priority == null ? "NORMAL" : priority;
        notification.createdAt = now;
        return notification;
    }

    public void markRead(Instant now) {
        if (readAt == null) {
            this.readAt = now;
        }
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getType() {
        return type;
    }

    public String getTitle() {
        return title;
    }

    public String getBody() {
        return body;
    }

    public String getEntityType() {
        return entityType;
    }

    public UUID getEntityId() {
        return entityId;
    }

    public String getPriority() {
        return priority;
    }

    public boolean isRead() {
        return readAt != null;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
