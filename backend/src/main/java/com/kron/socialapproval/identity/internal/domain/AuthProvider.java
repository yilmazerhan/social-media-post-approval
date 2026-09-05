package com.kron.socialapproval.identity.internal.domain;

/**
 * A way of proving identity, not a kind of user. Both values resolve to the same {@code app_user}
 * row and nothing downstream cares which was used (ARCHITECTURE.md section 5.1).
 */
public enum AuthProvider {
    LOCAL,
    SAML_ENTRA
}
