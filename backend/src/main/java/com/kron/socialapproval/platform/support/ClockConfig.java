package com.kron.socialapproval.platform.support;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * A single injected clock. Time-dependent behaviour — SLA due dates, lockout windows, digest
 * cut-offs — is only testable if nothing calls {@code Instant.now()} directly.
 */
@Configuration
public class ClockConfig {

    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}
