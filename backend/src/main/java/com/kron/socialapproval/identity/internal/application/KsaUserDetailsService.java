package com.kron.socialapproval.identity.internal.application;

import com.kron.socialapproval.access.api.AccessDirectory;
import com.kron.socialapproval.identity.internal.domain.AppUser;
import com.kron.socialapproval.identity.internal.domain.LocalCredential;
import com.kron.socialapproval.identity.internal.persistence.AppUserRepository;
import com.kron.socialapproval.identity.internal.persistence.LocalCredentialRepository;
import com.kron.socialapproval.platform.security.KsaPrincipal;
import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Loads a local account for authentication and rebuilds the principal for a user who arrived
 * through SAML. Permissions are resolved once here and carried in the session, so the authorization
 * check on every later request is a set lookup rather than a query.
 */
@Service
@Transactional(readOnly = true)
public class KsaUserDetailsService implements UserDetailsService {

    /** A hash no password can match, for a user who has no local credential. */
    private static final String UNUSABLE_HASH = "{argon2}$argon2id$v=19$m=19456,t=2,p=1$unusable$unusable";

    private final AppUserRepository users;
    private final LocalCredentialRepository credentials;
    private final AccessDirectory access;
    private final Clock clock;

    public KsaUserDetailsService(AppUserRepository users, LocalCredentialRepository credentials,
                                 AccessDirectory access, Clock clock) {
        this.users = users;
        this.credentials = credentials;
        this.access = access;
        this.clock = clock;
    }

    @Override
    public UserDetails loadUserByUsername(String identifier) {
        AppUser user = users.findByUsernameOrEmail(identifier)
                // Deliberately identical for an unknown user and a wrong password: this endpoint
                // must not become a user enumeration oracle.
                .orElseThrow(() -> new UsernameNotFoundException("Bad credentials"));
        return principalFor(user);
    }

    public KsaPrincipal principalFor(UUID userId) {
        AppUser user = users.findById(userId)
                .orElseThrow(() -> new UsernameNotFoundException("Bad credentials"));
        return principalFor(user);
    }

    private KsaPrincipal principalFor(AppUser user) {
        Instant now = clock.instant();
        Optional<LocalCredential> credential = credentials.findById(user.getId());
        Set<String> permissions = access.permissionsFor(user.getId());
        return new KsaPrincipal(
                user.getId(),
                user.getUsername() != null ? user.getUsername() : user.getEmail(),
                user.getDisplayName(),
                credential.map(LocalCredential::getPasswordHash).orElse(UNUSABLE_HASH),
                user.canAuthenticate(),
                credential.map(c -> c.isLocked(now)).orElse(false),
                access.roleCodesFor(user.getId()),
                permissions);
    }
}
