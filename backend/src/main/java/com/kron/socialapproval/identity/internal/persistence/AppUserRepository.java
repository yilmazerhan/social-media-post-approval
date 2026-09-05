package com.kron.socialapproval.identity.internal.persistence;

import com.kron.socialapproval.identity.internal.domain.AppUser;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AppUserRepository extends JpaRepository<AppUser, UUID> {

    @Query("""
           SELECT u FROM AppUser u
            WHERE u.deletedAt IS NULL
              AND (LOWER(u.username) = LOWER(:identifier) OR LOWER(u.email) = LOWER(:identifier))
           """)
    Optional<AppUser> findByUsernameOrEmail(@Param("identifier") String identifier);

    List<AppUser> findAllByIdIn(Collection<UUID> ids);

    @Query("SELECT u FROM AppUser u WHERE u.id IN :ids AND u.deletedAt IS NULL ORDER BY u.displayName")
    List<AppUser> findActiveByIds(@Param("ids") Collection<UUID> ids);
}
