package com.kron.socialapproval.demo;

import com.kron.socialapproval.platform.config.KsaProperties;
import com.kron.socialapproval.platform.support.Ids;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;

/**
 * Creates the first administrator so a fresh environment is usable.
 *
 * <p>Three rules keep this from becoming the security hole that default accounts usually are. It
 * runs only when explicitly switched on ({@code ksa.dev-seed.enabled}), it refuses to run alongside
 * the {@code prod} profile whatever the configuration says, and it never carries a password in the
 * source: either the operator supplies one through configuration, or one is generated, printed once
 * and flagged as must-change.
 *
 * <p>It also does nothing if any administrator already exists, so restarting an environment cannot
 * quietly resurrect a known account.
 */
@Configuration
public class DevAdminSeeder {

    private static final Logger log = LoggerFactory.getLogger(DevAdminSeeder.class);
    private static final SecureRandom RANDOM = new SecureRandom();

    @Bean
    @Order(20)
    public ApplicationRunner seedDevAdministrator(JdbcClient jdbc, PasswordEncoder passwordEncoder,
                                                  KsaProperties properties, Environment environment) {
        return args -> seed(jdbc, passwordEncoder, properties, environment);
    }

    @Transactional
    void seed(JdbcClient jdbc, PasswordEncoder passwordEncoder, KsaProperties properties,
              Environment environment) {
        KsaProperties.DevSeed config = properties.getDevSeed();
        if (!config.isEnabled()) {
            return;
        }
        if (environment.matchesProfiles("prod")) {
            log.error("ksa.dev-seed.enabled is true in a production profile. Refusing to seed an "
                    + "administrator; create one through the administration console instead.");
            return;
        }

        Long administrators = jdbc.sql("""
                        SELECT COUNT(*)
                          FROM user_role ur
                          JOIN role r ON r.id = ur.role_id
                          JOIN app_user u ON u.id = ur.user_id
                         WHERE r.code = 'ADMIN' AND u.deleted_at IS NULL
                        """)
                .query(Long.class)
                .single();
        if (administrators != null && administrators > 0) {
            log.debug("An administrator already exists; the development seed has nothing to do.");
            return;
        }

        boolean generated = config.getAdminPassword() == null || config.getAdminPassword().isBlank();
        String password = generated ? generatePassword() : config.getAdminPassword();

        UUID id = Ids.newId();
        jdbc.sql("""
                 INSERT INTO app_user (id, email, username, first_name, last_name, display_name,
                                       department_id, job_title, status, auth_provider, password_hash,
                                       password_updated_at, must_change_password)
                 SELECT :id, :email, :username, 'Platform', 'Administrator', 'Platform Administrator',
                        (SELECT d.id FROM department d WHERE d.code = 'IT_GOVERNANCE'),
                        'Platform Administrator', 'ACTIVE', 'LOCAL', :hash, now(), :mustChange
                 """)
                .param("id", id)
                .param("email", config.getAdminEmail())
                .param("username", config.getAdminUsername())
                .param("hash", passwordEncoder.encode(password))
                // A generated password is a one-time key, not a credential to keep using.
                .param("mustChange", generated)
                .update();

        jdbc.sql("""
                 INSERT INTO user_role (id, user_id, role_id, scope_type, source)
                 SELECT :assignmentId, :userId, r.id, 'GLOBAL', 'MANUAL' FROM role r WHERE r.code = 'ADMIN'
                 """)
                .param("assignmentId", Ids.newId())
                .param("userId", id)
                .update();

        if (generated) {
            log.warn("""

                    ============================================================================
                     Development administrator created: {}
                     One-time password: {}
                     It must be changed at first sign-in, and it is not printed again.
                     Set ksa.dev-seed.admin-password to choose your own instead.
                    ============================================================================
                    """, config.getAdminUsername(), password);
        } else {
            log.warn("Development administrator '{}' created with the configured password.",
                    config.getAdminUsername());
        }
    }

    /** 192 bits of randomness, URL-safe so it survives being copied out of a terminal. */
    private static String generatePassword() {
        byte[] bytes = new byte[24];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
