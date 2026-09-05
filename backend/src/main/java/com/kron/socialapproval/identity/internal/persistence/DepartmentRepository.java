package com.kron.socialapproval.identity.internal.persistence;

import com.kron.socialapproval.identity.internal.domain.Department;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DepartmentRepository extends JpaRepository<Department, UUID> {

    Optional<Department> findByCode(String code);

    List<Department> findByEnabledTrueOrderByNameAsc();
}
