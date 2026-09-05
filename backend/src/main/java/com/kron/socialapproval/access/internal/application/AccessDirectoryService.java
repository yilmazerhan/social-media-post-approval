package com.kron.socialapproval.access.internal.application;

import com.kron.socialapproval.access.api.AccessDirectory;
import com.kron.socialapproval.access.internal.persistence.AccessQueryRepository;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class AccessDirectoryService implements AccessDirectory {

    private final AccessQueryRepository repository;

    public AccessDirectoryService(AccessQueryRepository repository) {
        this.repository = repository;
    }

    @Override
    public Set<String> permissionsFor(UUID userId) {
        return Set.copyOf(repository.permissionCodesFor(userId));
    }

    @Override
    public List<String> roleCodesFor(UUID userId) {
        return repository.roleCodesFor(userId);
    }

    @Override
    public List<UUID> userIdsWithRole(String roleCode) {
        return repository.userIdsWithRole(roleCode);
    }
}
