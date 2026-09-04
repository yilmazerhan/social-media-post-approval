package com.kron.socialapproval.platform.security;

import java.util.Map;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.DelegatingPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Password hashing for local accounts.
 *
 * <p>Argon2id with the OWASP baseline parameters (m=19456 KiB, t=2, p=1). The encoder is wrapped in
 * a {@link DelegatingPasswordEncoder} so the parameters can be strengthened later and existing
 * hashes upgraded on the next successful login, without a migration or a forced password reset.
 *
 * @see <a href="https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html">
 *      OWASP Password Storage Cheat Sheet</a>
 */
@Configuration
public class PasswordEncoderConfig {

    private static final String ARGON2 = "argon2";
    private static final int SALT_LENGTH_BYTES = 16;
    private static final int HASH_LENGTH_BYTES = 32;
    private static final int PARALLELISM = 1;
    private static final int MEMORY_KIB = 19456;
    private static final int ITERATIONS = 2;

    @Bean
    public PasswordEncoder passwordEncoder() {
        Argon2PasswordEncoder argon2 = new Argon2PasswordEncoder(
                SALT_LENGTH_BYTES, HASH_LENGTH_BYTES, PARALLELISM, MEMORY_KIB, ITERATIONS);
        // bcrypt stays registered for verification only: it lets a legacy hash be read once and
        // rewritten as argon2. Nothing new is ever written with it.
        Map<String, PasswordEncoder> encoders = Map.of(
                ARGON2, argon2,
                "bcrypt", new BCryptPasswordEncoder());
        return new DelegatingPasswordEncoder(ARGON2, encoders);
    }
}
