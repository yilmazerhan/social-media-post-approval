package com.kron.socialapproval.platform.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;

/**
 * Baseline security wiring (ARCHITECTURE.md sections 6.3 and 13).
 *
 * <p>Phase 0 establishes the posture only: secure headers, CSRF for the cookie-session model,
 * method security switched on, and everything denied unless explicitly opened. The two
 * authentication mechanisms — local username/password and Entra ID over SAML 2.0 — are added in
 * phase 1 as additional filter chains on top of this one.
 */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    /**
     * Where the authenticated context is persisted between requests. Explicit rather than implicit,
     * because the login endpoint has to write to it directly.
     */
    @Bean
    public SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }

    @Bean
    public SecurityFilterChain apiFilterChain(HttpSecurity http, SecurityContextRepository contexts)
            throws Exception {
        http
                .authorizeHttpRequests(auth -> auth
                        // Public: the login screen needs these before anyone is authenticated.
                        .requestMatchers("/api/v1/system/**").permitAll()
                        // Sign-in itself, and the question of which sign-in methods exist, must be
                        // answerable before anyone is signed in.
                        .requestMatchers("/api/v1/auth/login", "/api/v1/auth/logout",
                                "/api/v1/auth/methods").permitAll()
                        // The API contract itself. Disabled outright in production, where springdoc
                        // is switched off and these paths simply do not exist.
                        .requestMatchers("/api/v1/openapi/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        // Served on the management port only, which the ingress does not publish.
                        .requestMatchers("/actuator/health", "/actuator/health/**", "/actuator/prometheus")
                        .permitAll()
                        // Everything else is closed by default; permissions are checked per method.
                        .anyRequest().authenticated())
                .securityContext(context -> context.securityContextRepository(contexts))
                .csrf(csrf -> csrf
                        // Double-submit cookie the SPA reads and echoes in X-XSRF-TOKEN.
                        .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                        // The default handler expects the XOR-masked token that a server-rendered
                        // form would carry. A single-page application reads the raw value out of the
                        // cookie, so the plain handler is the one that matches how the token travels.
                        .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()))
                .addFilterAfter(new CsrfCookieFilter(), CsrfFilter.class)
                .sessionManagement(session -> session
                        .sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED)
                        .sessionFixation(fixation -> fixation.newSession()))
                .headers(headers -> headers
                        .frameOptions(frame -> frame.deny())
                        .referrerPolicy(referrer -> referrer
                                .policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN))
                        .contentSecurityPolicy(csp -> csp.policyDirectives(
                                "default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'"))
                        .permissionsPolicyHeader(permissions -> permissions
                                .policy("camera=(), microphone=(), geolocation=()")))
                // An API answers 401; it never redirects a fetch() call to a login page.
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
                .httpBasic(basic -> basic.disable())
                .formLogin(form -> form.disable());

        return http.build();
    }
}
