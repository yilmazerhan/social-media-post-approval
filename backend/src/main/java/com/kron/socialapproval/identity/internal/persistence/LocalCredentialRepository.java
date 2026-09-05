package com.kron.socialapproval.identity.internal.persistence;

import com.kron.socialapproval.identity.internal.domain.LocalCredential;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LocalCredentialRepository extends JpaRepository<LocalCredential, UUID> {
}
