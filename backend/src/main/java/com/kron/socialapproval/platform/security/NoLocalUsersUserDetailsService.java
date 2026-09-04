package com.kron.socialapproval.platform.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;

/**
 * Placeholder user store for phase 0.
 *
 * <p>Without a {@link UserDetailsService} bean, Spring Boot helpfully creates an in-memory user and
 * prints its password to the console. That is a development convenience we do not want in an
 * application whose entire purpose is controlled access, so the store is explicitly empty until the
 * database-backed implementation lands in phase 1 (ARCHITECTURE.md sections 5.3 and 19.2).
 */
@Configuration
public class NoLocalUsersUserDetailsService {

    @Bean
    public UserDetailsService userDetailsService() {
        return username -> {
            throw new UsernameNotFoundException("Local authentication is not wired yet");
        };
    }
}
