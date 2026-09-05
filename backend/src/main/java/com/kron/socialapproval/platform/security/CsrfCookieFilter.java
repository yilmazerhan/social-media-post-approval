package com.kron.socialapproval.platform.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Forces the CSRF token to be materialised so the {@code XSRF-TOKEN} cookie is actually written.
 *
 * <p>The token is loaded lazily, which means a single-page application that only ever issues a GET
 * before its first POST would never receive one. Reading the attribute here is what puts the cookie
 * on the response for the SPA to echo back in {@code X-XSRF-TOKEN}.
 */
public class CsrfCookieFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        CsrfToken token = (CsrfToken) request.getAttribute(CsrfToken.class.getName());
        if (token != null) {
            token.getToken();
        }
        chain.doFilter(request, response);
    }
}
