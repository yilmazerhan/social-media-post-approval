package com.kron.socialapproval.platform.web;

import java.time.Instant;
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

    private final String applicationVersion;

    public SystemController(@Value("${spring.application.version:0.1.0-SNAPSHOT}") String applicationVersion) {
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

}
