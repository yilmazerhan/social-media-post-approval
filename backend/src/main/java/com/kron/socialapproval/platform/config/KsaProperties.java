package com.kron.socialapproval.platform.config;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Duration;
import java.time.LocalTime;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * Typed, validated configuration for the whole application.
 *
 * <p>Everything environment specific is bound here and checked at startup, so a missing or
 * malformed value fails the boot instead of surfacing later as a runtime error
 * (ARCHITECTURE.md section 12.4). Administrator-tunable values live in the {@code app_setting}
 * table instead; secrets never live in either.
 */
@Validated
@ConfigurationProperties(prefix = "ksa")
public class KsaProperties {

    /** Public base URL of the application, used in emails and SAML endpoint construction. */
    @NotBlank
    private String baseUrl = "http://localhost:8080";

    @Valid @NotNull
    private Auth auth = new Auth();

    @Valid @NotNull
    private Session session = new Session();

    @Valid @NotNull
    private Storage storage = new Storage();

    @Valid @NotNull
    private Workflow workflow = new Workflow();

    @Valid @NotNull
    private Mail mail = new Mail();

    @Valid @NotNull
    private Ai ai = new Ai();

    @Valid @NotNull
    private DevSeed devSeed = new DevSeed();

    public static class Auth {
        /** Local username/password authentication. */
        @Valid @NotNull
        private Local local = new Local();
        /** Microsoft Entra ID via SAML 2.0. */
        @Valid @NotNull
        private Saml saml = new Saml();

        public Local getLocal() { return local; }
        public void setLocal(Local local) { this.local = local; }
        public Saml getSaml() { return saml; }
        public void setSaml(Saml saml) { this.saml = saml; }

        public static class Local {
            private boolean enabled = true;
            @Min(8)
            private int passwordMinLength = 12;
            @Min(1)
            private int lockoutThreshold = 5;
            @NotNull
            private Duration lockoutDuration = Duration.ofMinutes(15);
            @NotNull
            private Duration resetTokenTtl = Duration.ofMinutes(30);

            public boolean isEnabled() { return enabled; }
            public void setEnabled(boolean enabled) { this.enabled = enabled; }
            public int getPasswordMinLength() { return passwordMinLength; }
            public void setPasswordMinLength(int v) { this.passwordMinLength = v; }
            public int getLockoutThreshold() { return lockoutThreshold; }
            public void setLockoutThreshold(int v) { this.lockoutThreshold = v; }
            public Duration getLockoutDuration() { return lockoutDuration; }
            public void setLockoutDuration(Duration v) { this.lockoutDuration = v; }
            public Duration getResetTokenTtl() { return resetTokenTtl; }
            public void setResetTokenTtl(Duration v) { this.resetTokenTtl = v; }
        }

        public static class Saml {
            private boolean enabled = false;
            private String registrationId = "entra";
            private String metadataUri;
            /** JIT_CREATE, JIT_LINK_ONLY or DISABLED (ARCHITECTURE.md section 5.2). */
            @NotBlank
            private String jitMode = "JIT_CREATE";

            public boolean isEnabled() { return enabled; }
            public void setEnabled(boolean enabled) { this.enabled = enabled; }
            public String getRegistrationId() { return registrationId; }
            public void setRegistrationId(String v) { this.registrationId = v; }
            public String getMetadataUri() { return metadataUri; }
            public void setMetadataUri(String v) { this.metadataUri = v; }
            public String getJitMode() { return jitMode; }
            public void setJitMode(String v) { this.jitMode = v; }
        }
    }

    public static class Session {
        @NotNull
        private Duration idleTimeout = Duration.ofMinutes(30);
        @NotNull
        private Duration absoluteTimeout = Duration.ofHours(12);

        public Duration getIdleTimeout() { return idleTimeout; }
        public void setIdleTimeout(Duration v) { this.idleTimeout = v; }
        public Duration getAbsoluteTimeout() { return absoluteTimeout; }
        public void setAbsoluteTimeout(Duration v) { this.absoluteTimeout = v; }
    }

    public static class Storage {
        /** filesystem (local, tests, single node) or s3 (phase 2). */
        @NotBlank
        private String provider = "filesystem";
        /** Root directory for the filesystem backend. */
        @NotBlank
        private String filesystemRoot = "./var/storage";
        private String endpoint;
        private String uploadsBucket = "ksa-uploads";
        private String mediaBucket = "ksa-media";
        private String derivativesBucket = "ksa-derivatives";
        @Min(1)
        private long maxImageBytes = 25L * 1024 * 1024;
        @Min(1)
        private long maxVideoBytes = 500L * 1024 * 1024;
        @Min(1)
        private int maxAttachmentsPerPost = 10;
        @NotNull
        private Duration presignTtl = Duration.ofMinutes(15);

        public String getProvider() { return provider; }
        public void setProvider(String v) { this.provider = v; }
        public String getFilesystemRoot() { return filesystemRoot; }
        public void setFilesystemRoot(String v) { this.filesystemRoot = v; }
        public String getEndpoint() { return endpoint; }
        public void setEndpoint(String v) { this.endpoint = v; }
        public String getUploadsBucket() { return uploadsBucket; }
        public void setUploadsBucket(String v) { this.uploadsBucket = v; }
        public String getMediaBucket() { return mediaBucket; }
        public void setMediaBucket(String v) { this.mediaBucket = v; }
        public String getDerivativesBucket() { return derivativesBucket; }
        public void setDerivativesBucket(String v) { this.derivativesBucket = v; }
        public long getMaxImageBytes() { return maxImageBytes; }
        public void setMaxImageBytes(long v) { this.maxImageBytes = v; }
        public long getMaxVideoBytes() { return maxVideoBytes; }
        public void setMaxVideoBytes(long v) { this.maxVideoBytes = v; }
        public int getMaxAttachmentsPerPost() { return maxAttachmentsPerPost; }
        public void setMaxAttachmentsPerPost(int v) { this.maxAttachmentsPerPost = v; }
        public Duration getPresignTtl() { return presignTtl; }
        public void setPresignTtl(Duration v) { this.presignTtl = v; }
    }

    public static class Workflow {
        @Min(1)
        private int defaultSlaHours = 24;
        /** ANY_ONE, ALL or SEQUENTIAL (ARCHITECTURE.md section 16.4). */
        @NotBlank
        private String defaultMode = "ANY_ONE";
        @Min(1)
        private int expiryDays = 14;
        @Min(1)
        private int slaWarningThresholdPercent = 80;

        public int getDefaultSlaHours() { return defaultSlaHours; }
        public void setDefaultSlaHours(int v) { this.defaultSlaHours = v; }
        public String getDefaultMode() { return defaultMode; }
        public void setDefaultMode(String v) { this.defaultMode = v; }
        public int getExpiryDays() { return expiryDays; }
        public void setExpiryDays(int v) { this.expiryDays = v; }
        public int getSlaWarningThresholdPercent() { return slaWarningThresholdPercent; }
        public void setSlaWarningThresholdPercent(int v) { this.slaWarningThresholdPercent = v; }
    }

    public static class Mail {
        @NotBlank
        private String from = "no-reply@kron.local";
        @NotNull
        private LocalTime digestTime = LocalTime.of(9, 0);
        @NotBlank
        private String digestTimezone = "Europe/Istanbul";
        @Min(1)
        private int maxAttempts = 5;

        public String getFrom() { return from; }
        public void setFrom(String v) { this.from = v; }
        public LocalTime getDigestTime() { return digestTime; }
        public void setDigestTime(LocalTime v) { this.digestTime = v; }
        public String getDigestTimezone() { return digestTimezone; }
        public void setDigestTimezone(String v) { this.digestTimezone = v; }
        public int getMaxAttempts() { return maxAttempts; }
        public void setMaxAttempts(int v) { this.maxAttempts = v; }
    }

    public static class Ai {
        /** Off by default: content leaves the network only once the customer signs off. */
        private boolean enabled = false;
        @NotBlank
        private String provider = "noop";
        private String model = "claude-sonnet-5";
        @Min(0)
        private int hourlyRequestCap = 100;

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public String getProvider() { return provider; }
        public void setProvider(String v) { this.provider = v; }
        public String getModel() { return model; }
        public void setModel(String v) { this.model = v; }
        public int getHourlyRequestCap() { return hourlyRequestCap; }
        public void setHourlyRequestCap(int v) { this.hourlyRequestCap = v; }
    }

    /**
     * The first-administrator seed. Off unless switched on, refused under the production profile,
     * and never carrying a password in source: one is supplied here or generated and printed once.
     */
    public static class DevSeed {
        private boolean enabled = false;
        @NotBlank
        private String adminUsername = "admin";
        @NotBlank
        private String adminEmail = "admin@kron.local";
        /** Leave empty to have a one-time password generated and logged. */
        private String adminPassword;

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public String getAdminUsername() { return adminUsername; }
        public void setAdminUsername(String v) { this.adminUsername = v; }
        public String getAdminEmail() { return adminEmail; }
        public void setAdminEmail(String v) { this.adminEmail = v; }
        public String getAdminPassword() { return adminPassword; }
        public void setAdminPassword(String v) { this.adminPassword = v; }
    }

    public DevSeed getDevSeed() { return devSeed; }
    public void setDevSeed(DevSeed devSeed) { this.devSeed = devSeed; }

    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }
    public Auth getAuth() { return auth; }
    public void setAuth(Auth auth) { this.auth = auth; }
    public Session getSession() { return session; }
    public void setSession(Session session) { this.session = session; }
    public Storage getStorage() { return storage; }
    public void setStorage(Storage storage) { this.storage = storage; }
    public Workflow getWorkflow() { return workflow; }
    public void setWorkflow(Workflow workflow) { this.workflow = workflow; }
    public Mail getMail() { return mail; }
    public void setMail(Mail mail) { this.mail = mail; }
    public Ai getAi() { return ai; }
    public void setAi(Ai ai) { this.ai = ai; }
}
