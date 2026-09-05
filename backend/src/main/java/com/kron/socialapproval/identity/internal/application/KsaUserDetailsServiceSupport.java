package com.kron.socialapproval.identity.internal.application;

/**
 * A valid Argon2id encoding of a value nobody knows, compared against when the submitted username
 * does not exist. Without it, an unknown user would return noticeably faster than a wrong password
 * and the login endpoint would leak which accounts are real.
 */
final class KsaUserDetailsServiceSupport {

    static final String DUMMY_HASH =
            "{argon2}$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$sIHnHUV8dCg6y2WKlG2C1Yqx7v1RxYKq2WlUXtwWzOo";

    private KsaUserDetailsServiceSupport() {
    }
}
