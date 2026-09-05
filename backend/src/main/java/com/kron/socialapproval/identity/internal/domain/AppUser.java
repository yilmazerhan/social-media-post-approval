package com.kron.socialapproval.identity.internal.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

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

    private String department;

    @Column(name = "job_title")
    private String jobTitle;

    @Column(nullable = false)
    private String locale = "tr-TR";

    @Column(nullable = false)
    private String timezone = "Europe/Istanbul";

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UserStatus status = UserStatus.ACTIVE;

    @Enumerated(EnumType.STRING)
    @Column(name = "primary_auth_source", nullable = false)
    private AuthProvider primaryAuthSource = AuthProvider.LOCAL;

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

    public static AppUser create(UUID id, String email, String username, String firstName, String lastName,
                                 String department, String jobTitle, AuthProvider source) {
        AppUser user = new AppUser();
        user.id = id;
        user.email = email;
        user.username = username;
        user.firstName = firstName;
        user.lastName = lastName;
        user.displayName = (firstName + " " + lastName).trim();
        user.department = department;
        user.jobTitle = jobTitle;
        user.primaryAuthSource = source;
        return user;
    }

    public void recordLogin(Instant when) {
        this.lastLoginAt = when;
        this.updatedAt = when;
    }

    public boolean canAuthenticate() {
        return status == UserStatus.ACTIVE && deletedAt == null;
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

    public String getDepartment() {
        return department;
    }

    public String getJobTitle() {
        return jobTitle;
    }

    public String getLocale() {
        return locale;
    }

    public String getTimezone() {
        return timezone;
    }

    public UserStatus getStatus() {
        return status;
    }

    public AuthProvider getPrimaryAuthSource() {
        return primaryAuthSource;
    }

    public Instant getLastLoginAt() {
        return lastLoginAt;
    }
}
