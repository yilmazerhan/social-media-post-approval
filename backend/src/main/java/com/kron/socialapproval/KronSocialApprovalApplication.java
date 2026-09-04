package com.kron.socialapproval;

import com.kron.socialapproval.platform.config.KsaProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Entry point of the Kron Social Approval platform.
 *
 * <p>The application is a modular monolith: every top-level package under this one is a
 * bounded context that owns its own tables and exposes a published {@code api} package.
 * See ARCHITECTURE.md sections 1.4 and 3.1.
 */
@SpringBootApplication
@EnableConfigurationProperties(KsaProperties.class)
@EnableScheduling
@EnableAsync
public class KronSocialApprovalApplication {

    public static void main(String[] args) {
        SpringApplication.run(KronSocialApprovalApplication.class, args);
    }
}
