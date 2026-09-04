package com.kron.socialapproval.platform.web;

import com.kron.socialapproval.platform.config.KsaProperties;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Minimal public surface used to validate that the skeleton boots and that configuration binding
 * works end to end. Feature endpoints arrive with their phases (ARCHITECTURE.md section 19.2).
 */
@RestController
@RequestMapping("/api/v1/system")
public class SystemController {

    private final KsaProperties properties;
    private final String applicationVersion;

    public SystemController(KsaProperties properties,
                            @Value("${spring.application.version:0.1.0-SNAPSHOT}") String applicationVersion) {
        this.properties = properties;
        this.applicationVersion = applicationVersion;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of(
                "status", "UP",
                "application", "kron-social-approval",
                "version", applicationVersion,
                "time", Instant.now().toString());
    }

    /**
     * Tells the login screen which authentication methods this deployment offers, so the same
     * frontend build serves an Entra-only, local-only or dual-mode environment
     * (ARCHITECTURE.md section 5.5).
     */
    @GetMapping("/auth-methods")
    public Map<String, Object> authMethods() {
        KsaProperties.Auth auth = properties.getAuth();
        return Map.of(
                "methods", List.of(
                        Map.of("id", "LOCAL", "enabled", auth.getLocal().isEnabled()),
                        Map.of("id", "SAML_ENTRA",
                                "enabled", auth.getSaml().isEnabled(),
                                "registrationId", auth.getSaml().getRegistrationId())));
    }
}
