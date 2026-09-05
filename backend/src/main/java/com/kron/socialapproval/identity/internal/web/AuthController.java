package com.kron.socialapproval.identity.internal.web;

import com.kron.socialapproval.identity.api.UserDirectory;
import com.kron.socialapproval.identity.api.UserSummary;
import com.kron.socialapproval.identity.internal.application.LocalAuthenticationService;
import com.kron.socialapproval.platform.config.KsaProperties;
import com.kron.socialapproval.platform.security.KsaPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import java.util.Set;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Sign-in, sign-out and "who am I".
 *
 * <p>{@code /me} returns the caller's effective permission set, which is what the UI renders from.
 * The UI never branches on a role name, so adding a role never means shipping frontend code
 * (ARCHITECTURE.md sections 2.4 and 6.1).
 */
@RestController
@RequestMapping("/api/v1")
public class AuthController {

    private final LocalAuthenticationService localAuthentication;
    private final UserDirectory userDirectory;
    private final KsaProperties properties;

    public AuthController(LocalAuthenticationService localAuthentication, UserDirectory userDirectory,
                          KsaProperties properties) {
        this.localAuthentication = localAuthentication;
        this.userDirectory = userDirectory;
        this.properties = properties;
    }

    public record LoginRequest(@NotBlank String username, @NotBlank String password) {
    }

    public record SessionResponse(
            UserSummary user,
            List<String> roles,
            Set<String> permissions,
            String authMethod) {
    }

    @PostMapping("/auth/login")
    public SessionResponse login(@RequestBody @jakarta.validation.Valid LoginRequest request,
                                 HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        KsaPrincipal principal = localAuthentication.login(
                request.username(), request.password(), httpRequest, httpResponse);
        return toSession(principal);
    }

    @PostMapping("/auth/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request) {
        localAuthentication.logout(request);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    public SessionResponse me(@AuthenticationPrincipal KsaPrincipal principal) {
        return toSession(principal);
    }

    /** Drives the sign-in screen: the same build serves an Entra-only or local-only deployment. */
    @GetMapping("/auth/methods")
    public AuthMethodsResponse methods() {
        KsaProperties.Auth auth = properties.getAuth();
        return new AuthMethodsResponse(
                auth.getLocal().isEnabled(),
                auth.getSaml().isEnabled(),
                "/saml2/authenticate/" + auth.getSaml().getRegistrationId());
    }

    public record AuthMethodsResponse(boolean localEnabled, boolean samlEnabled, String samlLoginUrl) {
    }

    private SessionResponse toSession(KsaPrincipal principal) {
        UserSummary user = userDirectory.require(principal.userId());
        return new SessionResponse(user, principal.roles(), principal.permissions(), "LOCAL");
    }
}
