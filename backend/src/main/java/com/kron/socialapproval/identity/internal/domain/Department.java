package com.kron.socialapproval.identity.internal.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * An organisational unit. Departments give approval routing something stable to match on, which a
 * free-text field on the user row could never do.
 */
@Entity
@Table(name = "department")
public class Department {

    @Id
    private UUID id;

    @Column(nullable = false, unique = true)
    private String code;

    @Column(nullable = false)
    private String name;

    private String description;

    @Column(name = "parent_department_id")
    private UUID parentDepartmentId;

    @Column(name = "manager_id")
    private UUID managerId;

    @Column(nullable = false)
    private boolean enabled = true;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    protected Department() {
    }

    public UUID getId() {
        return id;
    }

    public String getCode() {
        return code;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public UUID getParentDepartmentId() {
        return parentDepartmentId;
    }

    public UUID getManagerId() {
        return managerId;
    }

    public boolean isEnabled() {
        return enabled;
    }
}
