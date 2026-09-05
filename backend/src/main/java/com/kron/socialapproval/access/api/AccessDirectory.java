package com.kron.socialapproval.access.api;

import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Published view of who may do what. Other modules ask this instead of reading role tables.
 */
public interface AccessDirectory {

    /** Effective permission codes for a user, resolved from their role assignments. */
    Set<String> permissionsFor(UUID userId);

    /** Role codes held by a user — for display and reporting only, never for an access decision. */
    List<String> roleCodesFor(UUID userId);

    /** Users holding the given role, used to offer an approver list. */
    List<UUID> userIdsWithRole(String roleCode);
}
