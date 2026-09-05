package com.kron.socialapproval.identity.internal.application;

import com.kron.socialapproval.access.api.AccessDirectory;
import com.kron.socialapproval.identity.api.UserDirectory;
import com.kron.socialapproval.identity.api.UserSummary;
import com.kron.socialapproval.identity.internal.domain.AppUser;
import com.kron.socialapproval.identity.internal.persistence.AppUserRepository;
import com.kron.socialapproval.platform.error.ApiException;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class UserDirectoryService implements UserDirectory {

    private final AppUserRepository users;
    private final AccessDirectory access;

    public UserDirectoryService(AppUserRepository users, AccessDirectory access) {
        this.users = users;
        this.access = access;
    }

    @Override
    public Optional<UserSummary> find(UUID userId) {
        return users.findById(userId).map(UserDirectoryService::toSummary);
    }

    @Override
    public UserSummary require(UUID userId) {
        return find(userId).orElseThrow(() ->
                new ApiException(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "No such user."));
    }

    @Override
    public Map<UUID, UserSummary> findAll(Collection<UUID> userIds) {
        if (userIds.isEmpty()) {
            return Map.of();
        }
        return users.findAllByIdIn(userIds).stream()
                .map(UserDirectoryService::toSummary)
                .collect(Collectors.toMap(UserSummary::id, Function.identity()));
    }

    @Override
    public List<UserSummary> approvers() {
        List<UUID> ids = access.userIdsWithRole("APPROVER");
        if (ids.isEmpty()) {
            return List.of();
        }
        return users.findActiveByIds(ids).stream()
                .map(UserDirectoryService::toSummary)
                .sorted(Comparator.comparing(UserSummary::displayName))
                .toList();
    }

    static UserSummary toSummary(AppUser user) {
        return new UserSummary(
                user.getId(),
                user.getDisplayName(),
                user.getEmail(),
                user.getDepartment(),
                user.getJobTitle(),
                UserSummary.initialsOf(user.getFirstName(), user.getLastName()));
    }
}
