package com.kron.socialapproval.access.internal.persistence;

import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Access resolution is three joins and a projection; expressing it as SQL keeps it obvious and
 * keeps the entity graph out of the hot path of every request.
 */
@Repository
public class AccessQueryRepository {

    private final JdbcClient jdbc;

    public AccessQueryRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public List<String> permissionCodesFor(UUID userId) {
        return jdbc.sql("""
                        SELECT DISTINCT p.code
                          FROM user_role ra
                          JOIN role_permission rp ON rp.role_id = ra.role_id
                          JOIN permission p ON p.id = rp.permission_id
                         WHERE ra.user_id = :userId
                           AND (ra.expires_at IS NULL OR ra.expires_at > now())
                        """)
                .param("userId", userId)
                .query(String.class)
                .list();
    }

    public List<String> roleCodesFor(UUID userId) {
        return jdbc.sql("""
                        SELECT r.code
                          FROM user_role ra
                          JOIN role r ON r.id = ra.role_id
                         WHERE ra.user_id = :userId
                           AND (ra.expires_at IS NULL OR ra.expires_at > now())
                         ORDER BY r.code
                        """)
                .param("userId", userId)
                .query(String.class)
                .list();
    }

    public List<UUID> userIdsWithRole(String roleCode) {
        return jdbc.sql("""
                        SELECT ra.user_id
                          FROM user_role ra
                          JOIN role r ON r.id = ra.role_id
                          JOIN app_user u ON u.id = ra.user_id
                         WHERE r.code = :roleCode
                           AND u.status = 'ACTIVE'
                           AND u.deleted_at IS NULL
                        """)
                .param("roleCode", roleCode)
                .query(UUID.class)
                .list();
    }

    public void assignRole(UUID assignmentId, UUID userId, String roleCode, UUID grantedBy) {
        jdbc.sql("""
                 INSERT INTO user_role (id, user_id, role_id, scope_type, source, granted_by)
                 SELECT :id, :userId, r.id, 'GLOBAL', 'MANUAL', :grantedBy FROM role r WHERE r.code = :roleCode
                 ON CONFLICT (user_id, role_id, scope_type) DO NOTHING
                 """)
                .param("id", assignmentId)
                .param("userId", userId)
                .param("roleCode", roleCode)
                .param("grantedBy", grantedBy)
                .update();
    }
}
