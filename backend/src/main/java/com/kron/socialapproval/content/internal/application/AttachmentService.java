package com.kron.socialapproval.content.internal.application;

import com.kron.socialapproval.content.api.AttachmentDto;
import com.kron.socialapproval.content.internal.domain.Attachment;
import com.kron.socialapproval.content.internal.domain.AttachmentKind;
import com.kron.socialapproval.content.internal.domain.Post;
import com.kron.socialapproval.content.internal.persistence.AttachmentRepository;
import com.kron.socialapproval.content.internal.persistence.PostRepository;
import com.kron.socialapproval.media.api.BlobContent;
import com.kron.socialapproval.media.api.BlobKey;
import com.kron.socialapproval.media.api.BlobStorage;
import com.kron.socialapproval.media.api.UploadTarget;
import com.kron.socialapproval.platform.config.KsaProperties;
import com.kron.socialapproval.platform.error.ApiException;
import com.kron.socialapproval.platform.security.KsaPrincipal;
import com.kron.socialapproval.platform.support.Ids;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.apache.tika.Tika;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Media handling for the editor.
 *
 * <p>The browser asks for an upload target, sends the bytes, then confirms — the same three steps
 * whether the backend is S3 or the local filesystem. The declared content type is treated as a hint
 * throughout; what the file actually is gets decided by sniffing its bytes.
 */
@Service
public class AttachmentService {

    private static final Logger log = LoggerFactory.getLogger(AttachmentService.class);
    private static final DateTimeFormatter KEY_PREFIX = DateTimeFormatter.ofPattern("yyyy/MM").withZone(ZoneOffset.UTC);
    private static final Tika TIKA = new Tika();

    private static final Set<String> IMAGE_TYPES = Set.of("image/jpeg", "image/png", "image/gif", "image/webp");
    private static final Set<String> VIDEO_TYPES = Set.of("video/mp4", "video/quicktime", "video/webm");
    private static final Set<String> DOCUMENT_TYPES = Set.of("application/pdf");

    private final AttachmentRepository attachments;
    private final PostRepository posts;
    private final BlobStorage storage;
    private final PostMapper mapper;
    private final KsaProperties properties;
    private final Clock clock;

    public AttachmentService(AttachmentRepository attachments, PostRepository posts, BlobStorage storage,
                             PostMapper mapper, KsaProperties properties, Clock clock) {
        this.attachments = attachments;
        this.posts = posts;
        this.storage = storage;
        this.mapper = mapper;
        this.properties = properties;
        this.clock = clock;
    }

    public record PresignCommand(String filename, String contentType, long sizeBytes) {
    }

    public record PresignResult(AttachmentDto attachment, UploadTarget upload) {
    }

    @Transactional
    public PresignResult presign(UUID postId, PresignCommand command, KsaPrincipal actor) {
        Post post = requireEditablePost(postId, actor);
        KsaProperties.Storage limits = properties.getStorage();

        AttachmentKind kind = classify(command.contentType(), command.filename());
        long maxBytes = kind == AttachmentKind.VIDEO ? limits.getMaxVideoBytes() : limits.getMaxImageBytes();
        if (command.sizeBytes() > maxBytes) {
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "ATTACHMENT_TOO_LARGE",
                    "This file is larger than the %d MB limit for %s files."
                            .formatted(maxBytes / (1024 * 1024), kind.name().toLowerCase()));
        }
        long existing = attachments.countActiveByPost(postId);
        if (existing >= limits.getMaxAttachmentsPerPost()) {
            throw new ApiException(HttpStatus.CONFLICT, "TOO_MANY_ATTACHMENTS",
                    "A post can carry at most " + limits.getMaxAttachmentsPerPost() + " attachments.");
        }

        UUID attachmentId = Ids.newId();
        String key = "%s/%s/%s".formatted(KEY_PREFIX.format(clock.instant()), post.getId(), attachmentId);
        Attachment attachment = Attachment.pending(attachmentId, postId, kind, sanitizeFilename(command.filename()),
                command.contentType(), command.sizeBytes(), storage.uploadsBucket(), key,
                (int) existing, actor.userId(), clock.instant());
        attachments.save(attachment);

        UploadTarget target = storage.presignUpload(
                new BlobKey(storage.uploadsBucket(), key), command.contentType(), maxBytes,
                properties.getStorage().getPresignTtl());

        // A backend that cannot hand out a direct URL takes the bytes through the application.
        UploadTarget resolved = target.uploadUrl() != null ? target : new UploadTarget(
                "/api/v1/attachments/" + attachmentId + "/content",
                "PUT",
                Map.of("Content-Type", command.contentType()),
                properties.getStorage().getPresignTtl(),
                false);

        return new PresignResult(mapper.toDto(attachment), resolved);
    }

    /** Receives the bytes for the local backend and records what the file actually turned out to be. */
    @Transactional
    public AttachmentDto storeContent(UUID attachmentId, InputStream body, KsaPrincipal actor) {
        Attachment attachment = attachments.findActive(attachmentId).orElseThrow(AttachmentService::notFound);
        requireEditablePost(attachment.getPostId(), actor);

        byte[] bytes;
        try {
            bytes = body.readAllBytes();
        } catch (IOException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "UPLOAD_FAILED", "The upload could not be read.");
        }

        KsaProperties.Storage limits = properties.getStorage();
        long maxBytes = attachment.getKind() == AttachmentKind.VIDEO
                ? limits.getMaxVideoBytes() : limits.getMaxImageBytes();
        if (bytes.length > maxBytes) {
            attachment.markFailed("File exceeds the size limit for its type.");
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "ATTACHMENT_TOO_LARGE",
                    "This file is larger than the allowed limit.");
        }

        String detected = TIKA.detect(bytes, attachment.getOriginalFilename());
        if (!isAllowed(detected)) {
            attachment.markFailed("Content type " + detected + " is not accepted.");
            attachments.save(attachment);
            throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "ATTACHMENT_TYPE_REJECTED",
                    "This file is a " + detected + ", which is not an accepted type.");
        }
        if (classifyByType(detected) != attachment.getKind()) {
            attachment.markFailed("File content does not match its declared type.");
            attachments.save(attachment);
            throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "ATTACHMENT_TYPE_MISMATCH",
                    "The file contents do not match the type the browser declared.");
        }

        storage.write(new BlobKey(attachment.getStorageBucket(), attachment.getStorageKey()),
                new ByteArrayInputStream(bytes), bytes.length);

        Integer width = null;
        Integer height = null;
        if (attachment.getKind() == AttachmentKind.IMAGE) {
            int[] dimensions = readImageDimensions(bytes);
            width = dimensions[0] > 0 ? dimensions[0] : null;
            height = dimensions[1] > 0 ? dimensions[1] : null;
        }

        attachment.markUploaded(detected, bytes.length, sha256(bytes), width, height, null);
        attachments.save(attachment);
        return mapper.toDto(attachment);
    }

    public record CompleteCommand(Integer durationSeconds) {
    }

    /**
     * Confirms an upload and promotes it out of the quarantine bucket.
     *
     * <p>Antivirus scanning is a phase 2 component. Until it is wired the result is recorded as
     * "not configured" rather than as a clean scan, because a governance product must not claim a
     * check it did not perform.
     */
    @Transactional
    public AttachmentDto complete(UUID attachmentId, CompleteCommand command, KsaPrincipal actor) {
        Attachment attachment = attachments.findActive(attachmentId).orElseThrow(AttachmentService::notFound);
        requireEditablePost(attachment.getPostId(), actor);

        if (attachment.getStatus().name().equals("PENDING")) {
            throw new ApiException(HttpStatus.CONFLICT, "ATTACHMENT_NOT_UPLOADED",
                    "No content has been received for this attachment yet.");
        }

        attachment.markScanning();
        BlobKey from = new BlobKey(attachment.getStorageBucket(), attachment.getStorageKey());
        BlobKey to = new BlobKey(storage.mediaBucket(), attachment.getStorageKey());
        storage.move(from, to);

        if (attachment.getKind() == AttachmentKind.VIDEO && command != null && command.durationSeconds() != null) {
            // Reported by the browser. Server-side probing arrives with the media pipeline.
            attachment.markUploaded(attachment.getContentTypeDetected(), attachment.getSizeBytes(),
                    attachment.getContentHash(), attachment.getWidth(), attachment.getHeight(),
                    command.durationSeconds());
        }
        attachment.markReady("Antivirus scanning is not configured in this environment.");
        attachments.save(attachment);
        log.info("Attachment {} ready for post {}", attachmentId, attachment.getPostId());
        return mapper.toDto(attachment);
    }

    public record DescribeCommand(String altText, String caption, Integer sortOrder) {
    }

    @Transactional
    public AttachmentDto describe(UUID attachmentId, DescribeCommand command, KsaPrincipal actor) {
        Attachment attachment = attachments.findActive(attachmentId).orElseThrow(AttachmentService::notFound);
        requireEditablePost(attachment.getPostId(), actor);
        attachment.describe(command.altText(), command.caption(), command.sortOrder());
        attachments.save(attachment);
        return mapper.toDto(attachment);
    }

    @Transactional
    public void remove(UUID attachmentId, KsaPrincipal actor) {
        Attachment attachment = attachments.findActive(attachmentId).orElseThrow(AttachmentService::notFound);
        requireEditablePost(attachment.getPostId(), actor);
        attachment.softDelete(clock.instant());
        attachments.save(attachment);
    }

    /**
     * Streams an attachment. Read access follows the post: an author sees their own media, a
     * reviewer sees what they were asked to review.
     */
    @Transactional(readOnly = true)
    public BlobContent content(UUID attachmentId, KsaPrincipal actor) {
        Attachment attachment = attachments.findActive(attachmentId).orElseThrow(AttachmentService::notFound);
        Post post = posts.findActive(attachment.getPostId()).orElseThrow(AttachmentService::notFound);
        boolean isAuthor = post.getAuthorId().equals(actor.userId());
        if (!isAuthor && !actor.hasPermission("post:read:all") && !actor.hasPermission("post:read:assigned")) {
            throw notFound();
        }
        return storage.read(new BlobKey(storage.mediaBucket(), attachment.getStorageKey()))
                .or(() -> storage.read(new BlobKey(attachment.getStorageBucket(), attachment.getStorageKey())))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "ATTACHMENT_CONTENT_MISSING",
                        "The stored file could not be found."));
    }

    @Transactional(readOnly = true)
    public List<AttachmentDto> list(UUID postId) {
        return attachments.findActiveByPost(postId).stream().map(mapper::toDto).toList();
    }

    private Post requireEditablePost(UUID postId, KsaPrincipal actor) {
        Post post = posts.findActive(postId).orElseThrow(AttachmentService::notFound);
        boolean isAuthor = post.getAuthorId().equals(actor.userId());
        if (!isAuthor && !actor.hasPermission("post:update:any")) {
            throw notFound();
        }
        if (!post.getStatus().isEditable()) {
            throw new ApiException(HttpStatus.CONFLICT, "POST_NOT_EDITABLE",
                    "Media cannot be changed while the post is in status " + post.getStatus() + ".");
        }
        return post;
    }

    private static AttachmentKind classify(String declaredType, String filename) {
        AttachmentKind byType = classifyByType(declaredType);
        if (byType != null) {
            return byType;
        }
        throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "ATTACHMENT_TYPE_REJECTED",
                "\"" + filename + "\" is not an accepted file type.");
    }

    private static AttachmentKind classifyByType(String contentType) {
        if (contentType == null) {
            return null;
        }
        String normalised = contentType.toLowerCase();
        if (IMAGE_TYPES.contains(normalised)) {
            return AttachmentKind.IMAGE;
        }
        if (VIDEO_TYPES.contains(normalised)) {
            return AttachmentKind.VIDEO;
        }
        if (DOCUMENT_TYPES.contains(normalised)) {
            return AttachmentKind.DOCUMENT;
        }
        return null;
    }

    private static boolean isAllowed(String contentType) {
        return classifyByType(contentType) != null;
    }

    private static int[] readImageDimensions(byte[] bytes) {
        try (InputStream input = new ByteArrayInputStream(bytes)) {
            BufferedImage image = ImageIO.read(input);
            return image == null ? new int[]{0, 0} : new int[]{image.getWidth(), image.getHeight()};
        } catch (IOException e) {
            return new int[]{0, 0};
        }
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (Exception e) {
            return null;
        }
    }

    /** The filename is shown back to the user, so it is never allowed to carry markup or a path. */
    private static String sanitizeFilename(String filename) {
        if (filename == null || filename.isBlank()) {
            return "file";
        }
        String base = filename.replace('\\', '/');
        base = base.substring(base.lastIndexOf('/') + 1);
        return base.replaceAll("[<>\"'`\\p{Cntrl}]", "").trim();
    }

    private static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "ATTACHMENT_NOT_FOUND", "No such attachment.");
    }
}
