package com.kron.socialapproval.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kron.socialapproval.identity.internal.domain.AppUser;
import com.kron.socialapproval.identity.internal.domain.AuthProvider;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The identity rules the database also enforces, checked here so a violation fails fast in code
 * rather than as a constraint error at the far end of a transaction.
 */
class AppUserIdentityTest {

    private static final Instant NOW = Instant.parse("2026-09-05T08:00:00Z");

    @Test
    @DisplayName("a local account carries its own password hash")
    void localAccount() {
        AppUser user = AppUser.local(UUID.randomUUID(), "erhan@kron.local", "erhan", "Erhan", "Yilmaz",
                null, "Engineer", "{argon2}hash", NOW);

        assertThat(user.getAuthProvider()).isEqualTo(AuthProvider.LOCAL);
        assertThat(user.getPasswordHash()).isEqualTo("{argon2}hash");
        assertThat(user.getExternalIdentityId()).isNull();
    }

    @Test
    @DisplayName("a directory account carries an external identity and no password")
    void federatedAccount() {
        AppUser user = AppUser.federated(UUID.randomUUID(), "erhan@kron.com.tr", "9f4c-entra-object-id",
                "Erhan", "Yilmaz", null, "Engineer", NOW);

        assertThat(user.getAuthProvider()).isEqualTo(AuthProvider.ENTRA_ID);
        assertThat(user.getExternalIdentityId()).isEqualTo("9f4c-entra-object-id");
        // The directory owns the credential. Storing one here would be storing an Entra password.
        assertThat(user.getPasswordHash()).isNull();
    }

    @Test
    @DisplayName("a directory account cannot be given a password")
    void federatedAccountRefusesAPassword() {
        AppUser user = AppUser.federated(UUID.randomUUID(), "erhan@kron.com.tr", "entra-id", "Erhan",
                "Yilmaz", null, null, NOW);

        assertThatThrownBy(() -> user.rehashPassword("{argon2}hash", NOW))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("federated");
    }

    @Test
    @DisplayName("repeated failures lock the account for the configured window")
    void lockoutAfterRepeatedFailures() {
        AppUser user = AppUser.local(UUID.randomUUID(), "erhan@kron.local", "erhan", "Erhan", "Yilmaz",
                null, null, "{argon2}hash", NOW);

        for (int attempt = 0; attempt < 4; attempt++) {
            user.registerFailedLogin(NOW, 5, Duration.ofMinutes(15));
            assertThat(user.isLocked(NOW)).isFalse();
        }

        user.registerFailedLogin(NOW, 5, Duration.ofMinutes(15));

        assertThat(user.isLocked(NOW)).isTrue();
        assertThat(user.isLocked(NOW.plus(Duration.ofMinutes(16)))).isFalse();
    }

    @Test
    @DisplayName("a successful sign-in clears the lockout counter")
    void successfulLoginResetsLockout() {
        AppUser user = AppUser.local(UUID.randomUUID(), "erhan@kron.local", "erhan", "Erhan", "Yilmaz",
                null, null, "{argon2}hash", NOW);
        user.registerFailedLogin(NOW, 5, Duration.ofMinutes(15));

        user.registerSuccessfulLogin(NOW);

        assertThat(user.isLocked(NOW)).isFalse();
        assertThat(user.getLastLoginAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("only an active, undeleted account may authenticate")
    void onlyActiveAccountsAuthenticate() {
        AppUser user = AppUser.local(UUID.randomUUID(), "erhan@kron.local", "erhan", "Erhan", "Yilmaz",
                null, null, "{argon2}hash", NOW);

        assertThat(user.canAuthenticate()).isTrue();
    }
}
