package com.kron.socialapproval.demo;

import com.kron.socialapproval.media.api.BlobKey;
import com.kron.socialapproval.media.api.BlobStorage;
import com.kron.socialapproval.platform.support.Ids;
import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.GradientPaint;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;

/**
 * Demonstration fixture, active only under the {@code demo} profile.
 *
 * <p>It exists so the two hero screens can be evaluated against a realistic case: a high-priority
 * announcement on its third version, with two earlier rounds that came back with change requests,
 * findings from a content check, a discussion thread and an SLA running down. Nothing here runs
 * outside the profile, and no fabricated data reaches a normal deployment.
 *
 * <p>It writes through SQL rather than through any module's repositories: a fixture has no business
 * reaching inside a module, and the module boundary tests enforce that.
 */
@Configuration
@Profile("demo")
public class DemoDataSeeder {

    private static final Logger log = LoggerFactory.getLogger(DemoDataSeeder.class);

    /** Documented, obviously non-production credentials for the demo profile only. */
    private static final String DEMO_PASSWORD = "Demo!Passw0rd";

    // Version 3 is the live body; versions 1 and 2 are produced from it by reversing each of the
    // two changes the reviewer asked for, in order.
    private static final String CLOSING_SENTENCE =
            "Ahmet Yıldırım at Anadolu Finans has been running the beta since June and, with their "
                    + "written permission, reports a 40% reduction in standing privileges.";
    private static final String V1_CLOSING =
            "Ahmet Yıldırım at Anadolu Finans has been running the beta since June and reports a 40% "
                    + "reduction in standing privileges across their 12,000-endpoint production estate.";
    private static final String V2_CLOSING =
            "Ahmet Yıldırım at Anadolu Finans has been running the beta since June and reports a 40% "
                    + "reduction in standing privileges.";
    private static final String CLOSING_SENTENCE_TEXT = CLOSING_SENTENCE.replace("Yıldırım", "Yildirim");
    private static final String V1_CLOSING_TEXT = V1_CLOSING.replace("Yıldırım", "Yildirim");
    private static final String V2_CLOSING_TEXT = V2_CLOSING.replace("Yıldırım", "Yildirim");

    // Runs before the administrator seed, which then sees the demo administrator and stands down.
    @Bean
    @Order(10)
    public ApplicationRunner seedDemoData(JdbcClient jdbc, PasswordEncoder passwordEncoder, BlobStorage storage) {
        return args -> seed(jdbc, passwordEncoder, storage);
    }

    @Transactional
    void seed(JdbcClient jdbc, PasswordEncoder passwordEncoder, BlobStorage storage) {
        // Guard on the fixture's own marker rather than on "are there any users": an environment
        // seeded with an administrator and nothing else still wants the demo content.
        Long existing = jdbc.sql("SELECT COUNT(*) FROM app_user WHERE username = 'john.smith'")
                .query(Long.class)
                .single();
        if (existing != null && existing > 0) {
            log.info("Demo data already present; leaving it alone.");
            return;
        }

        log.warn("Seeding DEMO data. Sign in with john.smith / sarah.johnson / admin and the demo password.");

        UUID john = createUser(jdbc, passwordEncoder, "john.smith", "john.smith@kron.local",
                "John", "Smith", "Marketing", "Content Specialist", "EMPLOYEE");
        UUID sarah = createUser(jdbc, passwordEncoder, "sarah.johnson", "sarah.johnson@kron.local",
                "Sarah", "Johnson", "Marketing Communications", "Communications Lead", "APPROVER");
        UUID admin = createUser(jdbc, passwordEncoder, "admin", "admin@kron.local",
                "Aylin", "Demir", "IT Governance", "Platform Administrator", "ADMIN");
        // The administrator can also approve, which is how a real deployment covers absences.
        assignRole(jdbc, admin, "APPROVER");
        assignRole(jdbc, sarah, "EMPLOYEE");

        UUID channelId = jdbc.sql("SELECT id FROM channel WHERE code = 'LINKEDIN'").query(UUID.class).single();

        Instant now = Instant.now();
        Instant submittedV1 = now.minus(28, ChronoUnit.HOURS);
        Instant changesV1 = now.minus(26, ChronoUnit.HOURS);
        Instant submittedV2 = now.minus(22, ChronoUnit.HOURS);
        Instant changesV2 = now.minus(20, ChronoUnit.HOURS);
        Instant submittedV3 = now.minus(18, ChronoUnit.HOURS);
        Instant dueAt = now.plus(6, ChronoUnit.HOURS);

        UUID postId = Ids.newId();
        String bodyHtml = """
                <p>Today we are introducing <strong>Kron PAM 4.0</strong>, the largest release in the \
                platform's history. It brings a redesigned session manager, native support for \
                non-human identities, and policy-based access controls that work the same way \
                on-premises and in the cloud.</p>
                <p>Three things our customers asked for, and now have:</p>
                <ul>\
                <li><strong>Just-in-time access</strong> — privileges that exist only while the work does.</li>\
                <li><strong>Machine identity governance</strong> — service accounts and workload identities \
                under the same policy engine as people.</li>\
                <li><strong>Session intelligence</strong> — searchable, tamper-evident recordings of every \
                privileged session.</li>\
                </ul>
                <p>Kron PAM 4.0 is available from 15 October. Existing customers upgrade in place; \
                Ahmet Yıldırım at Anadolu Finans has been running the beta since June and, with their \
                written permission, reports a 40% reduction in standing privileges.</p>
                <p>Read the release notes at <a href="https://kron.com.tr">kron.com.tr</a>.</p>""";
        String bodyText = """
                Today we are introducing Kron PAM 4.0, the largest release in the platform's history. \
                It brings a redesigned session manager, native support for non-human identities, and \
                policy-based access controls that work the same way on-premises and in the cloud.
                Three things our customers asked for, and now have:
                Just-in-time access - privileges that exist only while the work does.
                Machine identity governance - service accounts and workload identities under the same \
                policy engine as people.
                Session intelligence - searchable, tamper-evident recordings of every privileged session.
                Kron PAM 4.0 is available from 15 October. Existing customers upgrade in place; Ahmet \
                Yildirim at Anadolu Finans has been running the beta since June and, with their written \
                permission, reports a 40% reduction in standing privileges.
                Read the release notes at kron.com.tr.""";

        jdbc.sql("""
                 INSERT INTO post (id, title, body_html, body_text, status, author_id, channel_id, priority,
                                   current_version_no, submitted_at, due_at, sla_state, created_at, created_by,
                                   updated_at, updated_by)
                 VALUES (:id, :title, :html, :text, 'IN_REVIEW', :author, :channel, 'HIGH', 3, :submitted,
                         :due, 'ON_TRACK', :created, :author, :submitted, :author)
                 """)
                .param("id", postId).param("title", "Introducing Kron PAM 4.0")
                .param("html", bodyHtml).param("text", bodyText)
                .param("author", john).param("channel", channelId)
                .param("submitted", ts(submittedV3)).param("due", ts(dueAt))
                .param("created", ts(now.minus(30, ChronoUnit.HOURS)))
                .update();

        UUID imageId = seedImage(jdbc, storage, postId, john, now);
        UUID videoId = seedVideoRecord(jdbc, postId, john, now);
        String manifest = """
                [{"id":"%s","filename":"kron-pam-4-hero.png","kind":"IMAGE"},\
                {"id":"%s","filename":"kron-pam-4-walkthrough.mp4","kind":"VIDEO"}]"""
                .formatted(imageId, videoId);

        // Each version differs from the one before it in exactly the way the reviewer asked for, so
        // the comparison view has something real to show.
        String v1Html = bodyHtml.replace(CLOSING_SENTENCE, V1_CLOSING);
        String v1Text = bodyText.replace(CLOSING_SENTENCE_TEXT, V1_CLOSING_TEXT);
        String v2Html = bodyHtml.replace(CLOSING_SENTENCE, V2_CLOSING);
        String v2Text = bodyText.replace(CLOSING_SENTENCE_TEXT, V2_CLOSING_TEXT);

        UUID v1 = insertVersion(jdbc, postId, 1, "Introducing Kron PAM 4.0", v1Html, v1Text, manifest,
                john, submittedV1);
        UUID v2 = insertVersion(jdbc, postId, 2, "Introducing Kron PAM 4.0", v2Html, v2Text, manifest,
                john, submittedV2);
        UUID v3 = insertVersion(jdbc, postId, 3, "Introducing Kron PAM 4.0", bodyHtml, bodyText, manifest,
                john, submittedV3);

        // Round 1: changes requested.
        UUID round1 = insertApproval(jdbc, postId, v1, "CHANGES_REQUESTED", john, submittedV1,
                submittedV1.plus(24, ChronoUnit.HOURS), changesV1);
        UUID step1 = insertStep(jdbc, round1, 1, sarah, john, submittedV1, "COMPLETED");
        insertDecision(jdbc, round1, step1, v1, sarah, "REQUEST_CHANGES",
                "The customer's estate size is not cleared for publication. Please take the endpoint "
                        + "count out before this goes anywhere.", changesV1);

        // Round 2: changes requested again.
        UUID round2 = insertApproval(jdbc, postId, v2, "CHANGES_REQUESTED", john, submittedV2,
                submittedV2.plus(24, ChronoUnit.HOURS), changesV2);
        UUID step2 = insertStep(jdbc, round2, 1, sarah, john, submittedV2, "COMPLETED");
        insertDecision(jdbc, round2, step2, v2, sarah, "REQUEST_CHANGES",
                "Closer. The named contact still needs the customer's written consent before we can "
                        + "publish it — either get the approval or drop the name.", changesV2);

        // Round 3: open, awaiting Sarah's decision.
        UUID round3 = insertApproval(jdbc, postId, v3, "PENDING", john, submittedV3, dueAt, null);
        insertStep(jdbc, round3, 1, sarah, john, submittedV3, "PENDING");

        seedAiReview(jdbc, postId, v3, now);
        seedComments(jdbc, postId, round3, john, sarah, submittedV3);

        jdbc.sql("""
                 INSERT INTO notification (id, user_id, type, title, body, entity_type, entity_id, priority, created_at)
                 VALUES (:id, :user, 'APPROVAL_ASSIGNED', 'Review requested: Introducing Kron PAM 4.0',
                         'John Smith submitted version 3 for your approval.', 'POST', :post, 'HIGH', :at)
                 """)
                .param("id", Ids.newId()).param("user", sarah).param("post", postId).param("at", ts(submittedV3))
                .update();

        seedSecondPost(jdbc, john, sarah, channelId, now);

        log.warn("Demo data ready. Password for every demo account: {}", DEMO_PASSWORD);
    }

    /**
     * Creates a local demo account. Department is matched by name against the reference data seeded
     * in V5, so the fixture never invents organisational structure of its own.
     */
    private UUID createUser(JdbcClient jdbc, PasswordEncoder encoder, String username, String email,
                            String firstName, String lastName, String department, String title, String role) {
        UUID id = Ids.newId();
        jdbc.sql("""
                 INSERT INTO app_user (id, email, username, first_name, last_name, display_name,
                                       department_id, job_title, status, auth_provider, password_hash,
                                       password_updated_at)
                 SELECT :id, :email, :username, :first, :last, :display, d.id, :title, 'ACTIVE', 'LOCAL',
                        :hash, now()
                   FROM department d WHERE d.name = :department
                 """)
                .param("id", id).param("email", email).param("username", username)
                .param("first", firstName).param("last", lastName)
                .param("display", firstName + " " + lastName)
                .param("department", department).param("title", title)
                .param("hash", encoder.encode(DEMO_PASSWORD))
                .update();

        assignRole(jdbc, id, role);
        return id;
    }

    private void assignRole(JdbcClient jdbc, UUID userId, String roleCode) {
        jdbc.sql("""
                 INSERT INTO user_role (id, user_id, role_id, scope_type, source)
                 SELECT :id, :userId, r.id, 'GLOBAL', 'MANUAL' FROM role r WHERE r.code = :code
                 ON CONFLICT (user_id, role_id, scope_type) DO NOTHING
                 """)
                .param("id", Ids.newId()).param("userId", userId).param("code", roleCode)
                .update();
    }

    private UUID insertVersion(JdbcClient jdbc, UUID postId, int versionNo, String title, String html,
                               String text, String manifest, UUID author, Instant at) {
        UUID id = Ids.newId();
        jdbc.sql("""
                 INSERT INTO post_version (id, post_id, version_no, title, body_html, body_text,
                                           attachment_manifest, reason, created_by, created_at)
                 VALUES (:id, :post, :no, :title, :html, :text, cast(:manifest as jsonb), 'SUBMISSION', :by, :at)
                 """)
                .param("id", id).param("post", postId).param("no", versionNo).param("title", title)
                .param("html", html).param("text", text).param("manifest", manifest)
                .param("by", author).param("at", ts(at))
                .update();
        return id;
    }

    private UUID insertApproval(JdbcClient jdbc, UUID postId, UUID versionId, String status, UUID requestedBy,
                                Instant requestedAt, Instant dueAt, Instant completedAt) {
        UUID id = Ids.newId();
        jdbc.sql("""
                 INSERT INTO approval_request (id, post_id, post_version_id, status, mode, required_approvals,
                                               requested_by, requested_at, due_at, sla_state, completed_at)
                 VALUES (:id, :post, :version, :status, 'ANY_ONE', 1, :by, :requested, :due, 'ON_TRACK', :completed)
                 """)
                .param("id", id).param("post", postId).param("version", versionId).param("status", status)
                .param("by", requestedBy).param("requested", ts(requestedAt)).param("due", ts(dueAt))
                .param("completed", ts(completedAt))
                .update();
        return id;
    }

    private UUID insertStep(JdbcClient jdbc, UUID requestId, int stepNo, UUID assignee, UUID assignedBy,
                            Instant at, String status) {
        UUID id = Ids.newId();
        jdbc.sql("""
                 INSERT INTO approval_step (id, approval_request_id, step_no, assignee_id, assigned_by,
                                            assigned_at, status, notified_at)
                 VALUES (:id, :request, :no, :assignee, :by, :at, :status, :at)
                 """)
                .param("id", id).param("request", requestId).param("no", stepNo).param("assignee", assignee)
                .param("by", assignedBy).param("at", ts(at)).param("status", status)
                .update();
        return id;
    }

    private void insertDecision(JdbcClient jdbc, UUID requestId, UUID stepId, UUID versionId, UUID decidedBy,
                                String decision, String comment, Instant at) {
        jdbc.sql("""
                 INSERT INTO approval_action (id, approval_request_id, approval_step_id, post_version_id,
                                              actor_id, action, note, performed_at)
                 VALUES (:id, :request, :step, :version, :by, :decision, :comment, :at)
                 """)
                .param("id", Ids.newId()).param("request", requestId).param("step", stepId)
                .param("version", versionId).param("by", decidedBy).param("decision", decision)
                .param("comment", comment).param("at", ts(at))
                .update();
    }

    /**
     * A real PNG, generated here rather than checked in, so the editor and the review screen have
     * genuine image bytes to display, measure and hash.
     */
    private UUID seedImage(JdbcClient jdbc, BlobStorage storage, UUID postId, UUID author, Instant now) {
        UUID id = Ids.newId();
        byte[] png = renderHeroImage();
        String key = "demo/%s/%s".formatted(postId, id);
        storage.write(new BlobKey(storage.mediaBucket(), key), new ByteArrayInputStream(png), png.length);

        jdbc.sql("""
                 INSERT INTO attachment (id, post_id, kind, original_filename, content_type_declared,
                                         content_type_detected, size_bytes, storage_bucket, storage_key, status,
                                         scan_result, width, height, alt_text, caption, sort_order, uploaded_by,
                                         created_at)
                 VALUES (:id, :post, 'IMAGE', 'kron-pam-4-hero.png', 'image/png', 'image/png', :size,
                         :bucket, :key, 'READY', 'Antivirus scanning is not configured in this environment.',
                         1200, 630, :alt, :caption, 0, :by, :at)
                 """)
                .param("id", id).param("post", postId).param("size", (long) png.length)
                .param("bucket", storage.mediaBucket()).param("key", key)
                .param("alt", "Kron PAM 4.0 release banner on a dark blue background.")
                .param("caption", "Kron PAM 4.0 — available 15 October")
                .param("by", author).param("at", ts(now.minus(29, ChronoUnit.HOURS)))
                .update();
        return id;
    }

    /**
     * The video is seeded as metadata only.
     *
     * <p>Encoding a real MP4 needs tooling this environment does not have, and inventing playable
     * bytes is not something a demo fixture should pretend to do. The record carries honest
     * metadata — duration, dimensions, size — and the scan field says plainly that no media file is
     * stored, so the review screen exercises the video card without the product claiming to hold a
     * file it does not.
     */
    private UUID seedVideoRecord(JdbcClient jdbc, UUID postId, UUID author, Instant now) {
        UUID id = Ids.newId();
        jdbc.sql("""
                 INSERT INTO attachment (id, post_id, kind, original_filename, content_type_declared,
                                         content_type_detected, size_bytes, storage_bucket, storage_key, status,
                                         scan_result, width, height, duration_seconds, alt_text, caption,
                                         sort_order, uploaded_by, created_at)
                 VALUES (:id, :post, 'VIDEO', 'kron-pam-4-walkthrough.mp4', 'video/mp4', 'video/mp4', 18234880,
                         'ksa-media', :key, 'READY',
                         'Demo record: no media file is stored for this sample video.',
                         1920, 1080, 42, :alt, :caption, 1, :by, :at)
                 """)
                .param("id", id).param("post", postId).param("key", "demo/%s/%s".formatted(postId, id))
                .param("alt", "Product walkthrough of the Kron PAM 4.0 session manager.")
                .param("caption", "42-second walkthrough of the new session manager")
                .param("by", author).param("at", ts(now.minus(29, ChronoUnit.HOURS)))
                .update();
        return id;
    }

    /**
     * Findings shaped like a real review of this text: the customer name is a genuine privacy
     * concern, and the closing line is genuinely informal for the channel.
     */
    private void seedAiReview(JdbcClient jdbc, UUID postId, UUID versionId, Instant now) {
        UUID reviewId = Ids.newId();
        jdbc.sql("""
                 INSERT INTO ai_analysis (id, post_id, post_version_id, provider, model, status, risk_level,
                                          risk_score, summary, latency_ms, created_at, completed_at)
                 VALUES (:id, :post, :version, 'demo-fixture', 'demo-fixture', 'COMPLETED', 'MEDIUM', 48,
                         'Two items to review before publication: one privacy concern and one tone note. '
                         || 'No credentials or internal hostnames were found.', 2140, :at, :at)
                 """)
                .param("id", reviewId).param("post", postId).param("version", versionId)
                .param("at", ts(now.minus(17, ChronoUnit.HOURS)))
                .update();

        insertFinding(jdbc, reviewId, "PRIVACY", "WARNING", "Named customer contact",
                "Ahmet Yıldırım at Anadolu Finans has been running the beta since June and, with their written permission, reports a 40% reduction in standing privileges",
                "The post names an individual at a customer organisation together with their employer. "
                        + "Publishing this needs written consent from both the person and the customer.",
                "Replace with \"a customer in the financial sector\" unless consent is on file.", 0);
        insertFinding(jdbc, reviewId, "TONE", "INFO", "Informal closing line",
                "Read the release notes at kron.com.tr.",
                "The closing sentence is more casual than the rest of the announcement and than the "
                        + "usual voice for this channel.",
                "Consider \"Full release notes are available at kron.com.tr.\"", 1);
        insertFinding(jdbc, reviewId, "SECURITY", "INFO", "No credentials or internal hosts detected",
                null, "The text was checked for credentials, tokens, internal hostnames and unreleased "
                        + "roadmap references. None were found.", null, 2);
        insertFinding(jdbc, reviewId, "BRAND", "INFO", "Product naming is consistent",
                null, "\"Kron PAM 4.0\" is used consistently and matches the approved product name.", null, 3);
    }

    private void insertFinding(JdbcClient jdbc, UUID reviewId, String category, String severity, String title,
                               String excerpt, String explanation, String suggestion, int order) {
        jdbc.sql("""
                 INSERT INTO ai_finding (id, ai_analysis_id, category, severity, title, excerpt, explanation,
                                         suggestion, sort_order)
                 VALUES (:id, :review, :category, :severity, :title, :excerpt, :explanation, :suggestion, :order)
                 """)
                .param("id", Ids.newId()).param("review", reviewId).param("category", category)
                .param("severity", severity).param("title", title).param("excerpt", excerpt)
                .param("explanation", explanation).param("suggestion", suggestion).param("order", order)
                .update();
    }

    private void seedComments(JdbcClient jdbc, UUID postId, UUID approvalId, UUID john, UUID sarah, Instant at) {
        jdbc.sql("""
                 INSERT INTO post_comment (id, post_id, approval_request_id, author_id, body, is_internal, created_at)
                 VALUES (:id, :post, :approval, :author, :body, false, :at)
                 """)
                .param("id", Ids.newId()).param("post", postId).param("approval", approvalId).param("author", john)
                .param("body", "Version 3 drops the estate-size figure and I have the customer's written "
                        + "consent for the name — forwarded it to you separately.")
                .param("at", ts(at.plus(3, ChronoUnit.MINUTES)))
                .update();

        jdbc.sql("""
                 INSERT INTO post_comment (id, post_id, approval_request_id, author_id, body, is_internal, created_at)
                 VALUES (:id, :post, :approval, :author, :body, false, :at)
                 """)
                .param("id", Ids.newId()).param("post", postId).param("approval", approvalId).param("author", sarah)
                .param("body", "Thanks — I have the consent email. Checking the wording against the "
                        + "October campaign now.")
                .param("at", ts(at.plus(95, ChronoUnit.MINUTES)))
                .update();
    }

    /** A second post so the editor has a draft to open and the queue has more than one row. */
    private void seedSecondPost(JdbcClient jdbc, UUID john, UUID sarah, UUID channelId, Instant now) {
        UUID draftId = Ids.newId();
        jdbc.sql("""
                 INSERT INTO post (id, title, body_html, body_text, status, author_id, channel_id, priority,
                                   current_version_no, sla_state, created_at, created_by, updated_at, updated_by)
                 VALUES (:id, 'Security advisory: quarterly patch cycle', :html, :text, 'DRAFT', :author,
                         :channel, 'NORMAL', 0, 'NONE', :at, :author, :at, :author)
                 """)
                .param("id", draftId)
                .param("html", "<p>Our quarterly patch cycle begins on Monday. Customer-facing services "
                        + "are unaffected.</p>")
                .param("text", "Our quarterly patch cycle begins on Monday. Customer-facing services "
                        + "are unaffected.")
                .param("author", john).param("channel", channelId)
                .param("at", ts(now.minus(3, ChronoUnit.HOURS)))
                .update();
    }

    /** The JDBC driver has no mapping for Instant; timestamptz columns take an offset date-time. */
    private static OffsetDateTime ts(Instant instant) {
        return instant == null ? null : instant.atOffset(ZoneOffset.UTC);
    }

    private static byte[] renderHeroImage() {
        BufferedImage image = new BufferedImage(1200, 630, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = image.createGraphics();
        graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        graphics.setPaint(new GradientPaint(0, 0, new Color(9, 20, 44), 1200, 630, new Color(21, 68, 140)));
        graphics.fillRect(0, 0, 1200, 630);
        graphics.setColor(new Color(96, 165, 250));
        graphics.fillRect(90, 250, 72, 6);
        graphics.setColor(Color.WHITE);
        graphics.setFont(new Font(Font.SANS_SERIF, Font.BOLD, 76));
        graphics.drawString("Kron PAM 4.0", 90, 220);
        graphics.setFont(new Font(Font.SANS_SERIF, Font.PLAIN, 32));
        graphics.setColor(new Color(203, 213, 225));
        graphics.drawString("Privileged access, governed end to end", 90, 320);
        graphics.drawString("Available 15 October", 90, 372);
        graphics.dispose();

        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            ImageIO.write(image, "png", out);
            return out.toByteArray();
        } catch (Exception e) {
            throw new IllegalStateException("Could not render the demo image", e);
        }
    }
}
