package com.kron.socialapproval.access.internal.persistence;

import com.kron.socialapproval.access.internal.domain.RoleEntity;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RoleRepository extends JpaRepository<RoleEntity, UUID> {

    Optional<RoleEntity> findByCode(String code);
}
