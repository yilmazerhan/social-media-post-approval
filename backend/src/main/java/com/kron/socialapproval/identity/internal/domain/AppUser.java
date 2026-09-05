package com.kron.socialapproval.identity.internal.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

/**
 * A person who can use the application, whichever way they sign in.
 *
 * <p>The row carries its own authentication details: the provider, the directory identity for a
 * federated account, and an Argon2id hash for a local one. A database constraint keeps the two
 * mutually exclusive — a local account must have a password, and an Entra account must not, because
 * a directory password is the directory's business and is never stored here.
 */
@Entity
@Table(name = "app_user")
public class AppUser {

    @Id
    private UUID id;

    @Column(nullable = false)
    private String email;

    private String username;

    @Column(name = "first_name", nullable = false)
    private String firstName;

    @Column(name = "last_name", nullable = false)
    private String lastName;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    @Column(name = "department_id")
    private UUID departmentId;

    @Column(name = "job_title")
    private String jobTitle;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UserStatus status = UserStatus.ACTIVE;

    @Enumerated(EnumType.STRING)
    @Column(name = "auth_provider", nullable = false)
    private AuthProvider authProvider = AuthProvider.LOCAL;

    /** The stable identifier the directory issues. Never the email address, which is mutable. */
    @Column(name = "external_identity_id")
    private String externalIdentityId;

    @Column(name = "password_hash")
    private String passwordHash;

    @Column(name = "password_updated_at")
    private Instant passwordUpdatedAt;

    @Column(name = "must_change_password", nullable = false)
    private boolean mustChangePassword;

    @Column(name = "failed_login_attempts", nullable = false)
    private int failedLoginAttempts;

    @Column(name = "locked_until")
    private Instant lockedUntil;

    @Column(nullable = false)
    private String locale = "tr-TR";

    @Column(nullable = false)
    private String timezone = "Europe/Istanbul";

    @Column(name = "last_login_at")
    private Instant lastLoginAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Column(name = "deleted_at")
    private Instant deletedAt;

    protected AppUser() {
    }

    /** A user of this application who signs in with a password it holds. */
    public static AppUser local(UUID id, String email, String username, String firstName, String lastName,
                                UUID departmentId, String jobTitle, String passwordHash, Instant now) {
        AppUser user = base(id, email, firstName, lastName, departmentId, jobTitle, now);
        user.username = username;
        user.authProvider = AuthProvider.LOCAL;
        user.passwordHash = passwordHash;
        user.passwordUpdatedAt = now;
        return user;
    }

    /** A user who signs in through the corporate directory. No credential is stored for them. */
    public static AppUser federated(UUID id, String email, String externalIdentityId, String firstName,
                                    String lastName, UUID departmentId, String jobTitle, Instant now) {
        AppUser user = base(id, email, firstName, lastName, departmentId, jobTitle, now);
        user.authProvider = AuthProvider.ENTRA_ID;
        user.externalIdentityId = externalIdentityId;
        return user;
    }

    private static AppUser base(UUID id, String email, String firstName, String lastName,
                                UUID departmentId, String jobTitle, Instant now) {
        AppUser user = new AppUser();
        user.id = id;
        user.email = email;
        user.firstName = firstName;
        user.lastName = lastName;
        user.displayName = (firstName + " " + lastName).trim();
        user.departmentId = departmentId;
        user.jobTitle = jobTitle;
        user.createdAt = now;
        user.updatedAt = now;
        return user;
    }

    public void recordLogin(Instant when) {
        this.lastLoginAt = when;
        this.updatedAt = when;
    }

    public boolean canAuthenticate() {
        return status == UserStatus.ACTIVE && deletedAt == null;
    }

    public boolean isLocked(Instant now) {
        return lockedUntil != null && lockedUntil.isAfter(now);
    }

    /** Counts a failed sign-in and locks the account once the threshold is reached. */
    public void registerFailedLogin(Instant now, int threshold, Duration lockDuration) {
        failedLoginAttempts++;
        if (failedLoginAttempts >= threshold) {
            lockedUntil = now.plus(lockDuration);
            failedLoginAttempts = 0;
        }
        this.updatedAt = now;
    }

    public void registerSuccessfulLogin(Instant now) {
        failedLoginAttempts = 0;
        lockedUntil = null;
        recordLogin(now);
    }

    /** Rewrites the stored hash — used to upgrade parameters, never to set a directory password. */
    public void rehashPassword(String newHash, Instant now) {
        if (authProvider != AuthProvider.LOCAL) {
            throw new IllegalStateException("A federated account cannot hold a password");
        }
        this.passwordHash = newHash;
        this.passwordUpdatedAt = now;
        this.updatedAt = now;
    }

    public UUID getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public String getUsername() {
        return username;
    }

    public String getFirstName() {
        return firstName;
    }

    public String getLastName() {
        return lastName;
    }

    public String getDisplayName() {
        return displayName;
    }

    public UUID getDepartmentId() {
        return departmentId;
    }

    public String getJobTitle() {
        return jobTitle;
    }

    public UserStatus getStatus() {
        return status;
    }

    public AuthProvider getAuthProvider() {
        return authProvider;
    }

    public String getExternalIdentityId() {
        return externalIdentityId;
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

    public String getLocale() {
        return locale;
    }

    public String getTimezone() {
        return timezone;
    }

    public Instant getLastLoginAt() {
        return lastLoginAt;
    }
}
