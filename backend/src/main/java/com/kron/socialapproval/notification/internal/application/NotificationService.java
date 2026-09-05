package com.kron.socialapproval.notification.internal.application;

import com.kron.socialapproval.notification.api.NotificationDto;
import com.kron.socialapproval.notification.api.NotificationPublisher;
import com.kron.socialapproval.notification.internal.domain.Notification;
import com.kron.socialapproval.notification.internal.persistence.NotificationRepository;
import com.kron.socialapproval.platform.support.Ids;
import java.time.Clock;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NotificationService implements NotificationPublisher {

    private final NotificationRepository notifications;
    private final Clock clock;

    public NotificationService(NotificationRepository notifications, Clock clock) {
        this.notifications = notifications;
        this.clock = clock;
    }

    @Override
    @Transactional
    public void notify(UUID userId, String type, String title, String body, String entityType,
                       UUID entityId, String priority) {
        notifications.save(Notification.of(Ids.newId(), userId, type, title, body, entityType, entityId,
                priority, clock.instant()));
    }

    @Transactional(readOnly = true)
    public List<NotificationDto> recentFor(UUID userId) {
        return notifications.findTop50ByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(NotificationService::toDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public long unreadCount(UUID userId) {
        return notifications.countUnread(userId);
    }

    @Transactional
    public void markRead(UUID notificationId, UUID userId) {
        notifications.findById(notificationId)
                .filter(notification -> notification.getUserId().equals(userId))
                .ifPresent(notification -> notification.markRead(clock.instant()));
    }

    @Transactional
    public void markAllRead(UUID userId) {
        notifications.findTop50ByUserIdOrderByCreatedAtDesc(userId)
                .forEach(notification -> notification.markRead(clock.instant()));
    }

    private static NotificationDto toDto(Notification notification) {
        return new NotificationDto(notification.getId(), notification.getType(), notification.getTitle(),
                notification.getBody(), notification.getEntityType(), notification.getEntityId(),
                notification.getPriority(), notification.isRead(), notification.getCreatedAt());
    }
}
