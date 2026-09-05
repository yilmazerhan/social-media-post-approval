package com.kron.socialapproval.notification.internal.web;

import com.kron.socialapproval.access.api.Permissions;
import com.kron.socialapproval.notification.api.NotificationDto;
import com.kron.socialapproval.notification.internal.application.NotificationService;
import com.kron.socialapproval.platform.security.KsaPrincipal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/notifications")
@PreAuthorize("hasAuthority('" + Permissions.NOTIFICATION_READ_OWN + "')")
public class NotificationController {

    private final NotificationService notifications;

    public NotificationController(NotificationService notifications) {
        this.notifications = notifications;
    }

    @GetMapping
    public List<NotificationDto> list(@AuthenticationPrincipal KsaPrincipal principal) {
        return notifications.recentFor(principal.userId());
    }

    @GetMapping("/unread-count")
    public Map<String, Long> unreadCount(@AuthenticationPrincipal KsaPrincipal principal) {
        return Map.of("count", notifications.unreadCount(principal.userId()));
    }

    @PostMapping("/{id}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void markRead(@PathVariable UUID id, @AuthenticationPrincipal KsaPrincipal principal) {
        notifications.markRead(id, principal.userId());
    }

    @PostMapping("/read-all")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void markAllRead(@AuthenticationPrincipal KsaPrincipal principal) {
        notifications.markAllRead(principal.userId());
    }
}
