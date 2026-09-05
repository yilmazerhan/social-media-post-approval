package com.kron.socialapproval.identity.internal.domain;

/** Only {@link #ACTIVE} may authenticate; every other value is a closed door with a reason. */
public enum UserStatus {
    ACTIVE,
    PENDING_ACTIVATION,
    DISABLED,
    LOCKED
}
