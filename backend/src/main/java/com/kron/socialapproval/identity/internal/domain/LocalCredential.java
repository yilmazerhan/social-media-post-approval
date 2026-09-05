package com.kron.socialapproval.identity.internal.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

/**
 * The password record for a local account. Only ever holds an Argon2id hash — a plaintext password
 * never reaches this class, a log line, or an exception message.
 */
@Entity
@Table(name = "local_credential")
public class LocalCredential {

    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "password_updated_at", nullable = false)
    private Instant passwordUpdatedAt = Instant.now();

    @Column(name = "must_change_password", nullable = false)
    private boolean mustChangePassword;

    @Column(name = "failed_attempts", nullable = false)
    private int failedAttempts;

    @Column(name = "locked_until")
    private Instant lockedUntil;

    protected LocalCredential() {
    }

    public static LocalCredential of(UUID userId, String passwordHash) {
        LocalCredential credential = new LocalCredential();
        credential.userId = userId;
        credential.passwordHash = passwordHash;
        return credential;
    }

    public boolean isLocked(Instant now) {
        return lockedUntil != null && lockedUntil.isAfter(now);
    }

    /** Counts a failure and locks the account once the threshold is reached. */
    public void registerFailure(Instant now, int threshold, Duration lockDuration) {
        failedAttempts++;
        if (failedAttempts >= threshold) {
            lockedUntil = now.plus(lockDuration);
            failedAttempts = 0;
        }
    }

    public void registerSuccess() {
        failedAttempts = 0;
        lockedUntil = null;
    }

    public void rehash(String newHash, Instant now) {
        this.passwordHash = newHash;
        this.passwordUpdatedAt = now;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public boolean isMustChangePassword() {
        return mustChangePassword;
    }

    public Instant getLockedUntil() {
        return lockedUntil;
    }
}
