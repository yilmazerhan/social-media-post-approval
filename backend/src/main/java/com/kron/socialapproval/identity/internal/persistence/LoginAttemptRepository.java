package com.kron.socialapproval.identity.internal.persistence;

import com.kron.socialapproval.identity.internal.domain.LoginAttempt;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LoginAttemptRepository extends JpaRepository<LoginAttempt, UUID> {
}
