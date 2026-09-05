package com.kron.socialapproval.platform.security;

import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

/**
 * The authenticated caller, whichever front door they came through.
 *
 * <p>Authorities are permission codes ({@code post:submit}), never role names: code asks whether a
 * user may do a thing, not what they are called (ARCHITECTURE.md section 6.1). The principal
 * carries no password once authentication has completed.
 */
public final class KsaPrincipal implements UserDetails {

    private final UUID userId;
    private final String username;
    private final String displayName;
    private final String passwordHash;
    private final boolean active;
    private final boolean locked;
    private final List<String> roles;
    private final Set<String> permissions;

    public KsaPrincipal(UUID userId, String username, String displayName, String passwordHash,
                        boolean active, boolean locked, List<String> roles, Set<String> permissions) {
        this.userId = userId;
        this.username = username;
        this.displayName = displayName;
        this.passwordHash = passwordHash;
        this.active = active;
        this.locked = locked;
        this.roles = List.copyOf(roles);
        this.permissions = Set.copyOf(permissions);
    }

    /** Copy without the credential, stored in the session after a successful login. */
    public KsaPrincipal withoutCredentials() {
        return new KsaPrincipal(userId, username, displayName, null, active, locked, roles, permissions);
    }

    public UUID userId() {
        return userId;
    }

    public String displayName() {
        return displayName;
    }

    public List<String> roles() {
        return roles;
    }

    public Set<String> permissions() {
        return permissions;
    }

    public boolean hasPermission(String permission) {
        return permissions.contains(permission);
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return permissions.stream().map(SimpleGrantedAuthority::new).map(GrantedAuthority.class::cast).toList();
    }

    @Override
    public String getPassword() {
        return passwordHash;
    }

    @Override
    public String getUsername() {
        return username;
    }

    @Override
    public boolean isAccountNonLocked() {
        return !locked;
    }

    @Override
    public boolean isEnabled() {
        return active;
    }
}
