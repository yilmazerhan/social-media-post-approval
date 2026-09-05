package com.kron.socialapproval.identity.api;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** Published read model of users. Other modules never touch the identity tables directly. */
public interface UserDirectory {

    Optional<UserSummary> find(UUID userId);

    UserSummary require(UUID userId);

    /** Batch lookup, so a list screen resolves its authors in one query rather than N. */
    Map<UUID, UserSummary> findAll(Collection<UUID> userIds);

    /** Active users who may act as approvers, for the assignment control in the editor. */
    List<UserSummary> approvers();
}
