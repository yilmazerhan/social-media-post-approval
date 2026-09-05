package com.kron.socialapproval.identity.internal.application;

import com.kron.socialapproval.identity.internal.domain.AppUser;
import com.kron.socialapproval.identity.internal.domain.AuthProvider;
import com.kron.socialapproval.identity.internal.domain.LoginAttempt;
import com.kron.socialapproval.identity.internal.persistence.AppUserRepository;
import com.kron.socialapproval.identity.internal.persistence.LoginAttemptRepository;
import com.kron.socialapproval.platform.config.KsaProperties;
import com.kron.socialapproval.platform.error.ApiException;
import com.kron.socialapproval.platform.security.KsaPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Username and password authentication for local accounts.
 *
 * <p>Four things this deliberately does not do: distinguish an unknown user from a wrong password in
 * its response, let a directory account be signed in with a password, log anything derived from the
 * submitted password, or leave a session id unchanged across a privilege boundary.
 */
@Service
public class LocalAuthenticationService {

    private static final Logger log = LoggerFactory.getLogger(LocalAuthenticationService.class);
    private static final String METHOD = "LOCAL";

    private final AppUserRepository users;
    private final LoginAttemptRepository attempts;
    private final KsaUserDetailsService userDetailsService;
    private final PasswordEncoder passwordEncoder;
    private final SecurityContextRepository securityContextRepository;
    private final KsaProperties properties;
    private final Clock clock;

    public LocalAuthenticationService(AppUserRepository users, LoginAttemptRepository attempts,
                                      KsaUserDetailsService userDetailsService, PasswordEncoder passwordEncoder,
                                      SecurityContextRepository securityContextRepository,
                                      KsaProperties properties, Clock clock) {
        this.users = users;
        this.attempts = attempts;
        this.userDetailsService = userDetailsService;
        this.passwordEncoder = passwordEncoder;
        this.securityContextRepository = securityContextRepository;
        this.properties = properties;
        this.clock = clock;
    }

    @Transactional
    public KsaPrincipal login(String identifier, String password,
                              HttpServletRequest request, HttpServletResponse response) {
        if (!properties.getAuth().getLocal().isEnabled()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "LOCAL_AUTH_DISABLED",
                    "Local sign-in is disabled for this environment.");
        }

        Instant now = clock.instant();
        Optional<AppUser> found = users.findByUsernameOrEmail(identifier);

        if (found.isEmpty()) {
            // Still run a hash comparison so a missing user and a wrong password take a similar
            // amount of time.
            passwordEncoder.matches(password, KsaUserDetailsServiceSupport.DUMMY_HASH);
            record(null, identifier, "BAD_CREDENTIALS", request, now);
            throw invalidCredentials();
        }

        AppUser user = found.get();

        if (user.getAuthProvider() != AuthProvider.LOCAL) {
            // A directory account has no password here, and must not be given one by this path.
            record(user.getId(), identifier, "WRONG_PROVIDER", request, now);
            throw new ApiException(HttpStatus.CONFLICT, "USE_DIRECTORY_SIGN_IN",
                    "This account signs in with Microsoft Entra ID.");
        }
        if (user.isLocked(now)) {
            record(user.getId(), identifier, "LOCKED", request, now);
            throw new ApiException(HttpStatus.LOCKED, "ACCOUNT_LOCKED",
                    "This account is temporarily locked after repeated failed sign-in attempts.");
        }
        if (!user.canAuthenticate()) {
            record(user.getId(), identifier, "DISABLED", request, now);
            throw invalidCredentials();
        }
        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            user.registerFailedLogin(now,
                    properties.getAuth().getLocal().getLockoutThreshold(),
                    properties.getAuth().getLocal().getLockoutDuration());
            record(user.getId(), identifier, "BAD_CREDENTIALS", request, now);
            throw invalidCredentials();
        }

        // Parameters may have been strengthened since this hash was written; upgrade it silently.
        if (passwordEncoder.upgradeEncoding(user.getPasswordHash())) {
            user.rehashPassword(passwordEncoder.encode(password), now);
        }
        user.registerSuccessfulLogin(now);
        record(user.getId(), identifier, "SUCCESS", request, now);

        KsaPrincipal principal = userDetailsService.principalFor(user.getId()).withoutCredentials();
        establishSession(principal, request, response);
        log.info("Local sign-in succeeded for user {}", user.getId());
        return principal;
    }

    /** Issues a new session id and stores the authenticated context in it. */
    private void establishSession(KsaPrincipal principal, HttpServletRequest request, HttpServletResponse response) {
        if (request.getSession(false) != null) {
            request.changeSessionId();
        } else {
            request.getSession(true);
        }
        Authentication authentication = UsernamePasswordAuthenticationToken.authenticated(
                principal, null, principal.getAuthorities());
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        securityContextRepository.saveContext(context, request, response);
    }

    public void logout(HttpServletRequest request) {
        if (request.getSession(false) != null) {
            request.getSession(false).invalidate();
        }
        SecurityContextHolder.clearContext();
    }

    private ApiException invalidCredentials() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS",
                "The username or password is incorrect.");
    }

    private void record(UUID userId, String identifier, String result,
                        HttpServletRequest request, Instant now) {
        attempts.save(LoginAttempt.of(userId, identifier, METHOD, result,
                request.getRemoteAddr(), request.getHeader("User-Agent"), now));
    }
}
