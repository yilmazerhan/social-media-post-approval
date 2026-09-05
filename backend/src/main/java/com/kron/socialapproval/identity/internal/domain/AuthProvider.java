package com.kron.socialapproval.identity.internal.domain;

/**
 * How a person proves who they are.
 *
 * <p>This is a property of the account, not a kind of user: everything downstream — permissions,
 * approvals, notifications — behaves identically whichever value a user carries.
 */
public enum AuthProvider {

    /** Username and password held by this application, hashed with Argon2id. */
    LOCAL,

    /** Microsoft Entra ID. The directory owns the credential; this application never sees it. */
    ENTRA_ID
}
