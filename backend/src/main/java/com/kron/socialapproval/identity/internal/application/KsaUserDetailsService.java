package com.kron.socialapproval.identity.internal.application;

import com.kron.socialapproval.access.api.AccessDirectory;
import com.kron.socialapproval.identity.internal.domain.AppUser;
import com.kron.socialapproval.identity.internal.domain.AuthProvider;
import com.kron.socialapproval.identity.internal.persistence.AppUserRepository;
import com.kron.socialapproval.platform.security.KsaPrincipal;
import java.time.Clock;
import java.util.Set;
import java.util.UUID;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Loads a user for authentication, and rebuilds the principal for a user who arrived through the
 * directory. Permissions are resolved once here and carried in the session, so the authorization
 * check on every later request is a set lookup rather than a query.
 */
@Service
@Transactional(readOnly = true)
public class KsaUserDetailsService implements UserDetailsService {

    /** Stands in for a federated account, which by construction has no password to compare. */
    private static final String UNUSABLE_HASH = "{argon2}$argon2id$v=19$m=19456,t=2,p=1$unusable$unusable";

    private final AppUserRepository users;
    private final AccessDirectory access;
    private final Clock clock;

    public KsaUserDetailsService(AppUserRepository users, AccessDirectory access, Clock clock) {
        this.users = users;
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
        return principalFor(users.findById(userId)
                .orElseThrow(() -> new UsernameNotFoundException("Bad credentials")));
    }

    private KsaPrincipal principalFor(AppUser user) {
        Set<String> permissions = access.permissionsFor(user.getId());
        return new KsaPrincipal(
                user.getId(),
                user.getUsername() != null ? user.getUsername() : user.getEmail(),
                user.getDisplayName(),
                user.getAuthProvider() == AuthProvider.LOCAL ? user.getPasswordHash() : UNUSABLE_HASH,
                user.canAuthenticate(),
                user.isLocked(clock.instant()),
                access.roleCodesFor(user.getId()),
                permissions);
    }
}
