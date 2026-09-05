package com.kron.socialapproval.identity.internal.domain;

import com.kron.socialapproval.platform.support.Ids;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** Every attempt, successful or not. Feeds lockout, brute-force reporting and the audit trail. */
@Entity
@Table(name = "login_attempt")
public class LoginAttempt {

    @Id
    private UUID id = Ids.newId();

    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "username_attempted", nullable = false)
    private String usernameAttempted;

    @Column(name = "auth_method", nullable = false)
    private String authMethod;

    @Column(nullable = false)
    private String result;

    @Column(name = "ip_address")
    private String ipAddress;

    @Column(name = "user_agent")
    private String userAgent;

    @Column(name = "attempted_at", nullable = false)
    private Instant attemptedAt = Instant.now();

    protected LoginAttempt() {
    }

    public static LoginAttempt of(UUID userId, String username, String method, String result,
                                  String ip, String userAgent, Instant when) {
        LoginAttempt attempt = new LoginAttempt();
        attempt.userId = userId;
        attempt.usernameAttempted = username;
        attempt.authMethod = method;
        attempt.result = result;
        attempt.ipAddress = ip;
        attempt.userAgent = userAgent == null ? null : userAgent.substring(0, Math.min(userAgent.length(), 500));
        attempt.attemptedAt = when;
        return attempt;
    }
}
