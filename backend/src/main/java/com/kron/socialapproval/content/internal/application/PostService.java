package com.kron.socialapproval.content.internal.application;

import tools.jackson.databind.ObjectMapper;
import com.kron.socialapproval.content.api.AttachmentDto;
import com.kron.socialapproval.content.api.ChannelDto;
import com.kron.socialapproval.content.api.PostContentQuery;
import com.kron.socialapproval.content.api.PostDetailDto;
import com.kron.socialapproval.content.api.PostLifecycle;
import com.kron.socialapproval.content.api.PostSummaryDto;
import com.kron.socialapproval.content.api.PostVersionDto;
import com.kron.socialapproval.content.internal.domain.Attachment;
import com.kron.socialapproval.content.internal.domain.Channel;
import com.kron.socialapproval.content.internal.domain.Post;
import com.kron.socialapproval.content.internal.domain.PostStatus;
import com.kron.socialapproval.content.internal.domain.PostVersion;
import com.kron.socialapproval.content.internal.domain.Priority;
import com.kron.socialapproval.content.internal.domain.VersionReason;
import com.kron.socialapproval.content.internal.persistence.AttachmentRepository;
import com.kron.socialapproval.content.internal.persistence.ChannelRepository;
import com.kron.socialapproval.content.internal.persistence.PostRepository;
import com.kron.socialapproval.content.internal.persistence.PostVersionRepository;
import com.kron.socialapproval.identity.api.UserDirectory;
import com.kron.socialapproval.identity.api.UserSummary;
import com.kron.socialapproval.platform.error.ApiException;
import com.kron.socialapproval.platform.security.KsaPrincipal;
import com.kron.socialapproval.platform.support.Ids;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Post use cases: create, edit, read, and the lifecycle transitions the workflow module drives.
 *
 * <p>Every method that changes something takes the acting principal, because "who did this" is not
 * metadata in this product — it is the point of it.
 */
@Service
public class PostService implements PostContentQuery, PostLifecycle {

    private final PostRepository posts;
    private final PostVersionRepository versions;
    private final AttachmentRepository attachments;
    private final ChannelRepository channels;
    private final UserDirectory users;
    private final PostMapper mapper;
    private final HtmlSanitizer sanitizer;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    public PostService(PostRepository posts, PostVersionRepository versions, AttachmentRepository attachments,
                       ChannelRepository channels, UserDirectory users, PostMapper mapper,
                       HtmlSanitizer sanitizer, ObjectMapper objectMapper, Clock clock) {
        this.posts = posts;
        this.versions = versions;
        this.attachments = attachments;
        this.channels = channels;
        this.users = users;
        this.mapper = mapper;
        this.sanitizer = sanitizer;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    public record CreateCommand(String title, UUID channelId) {
    }

    public record UpdateCommand(String title, String bodyHtml, String priority, UUID channelId,
                                Long expectedConcurrencyToken) {
    }

    @Transactional
    public PostDetailDto create(CreateCommand command, KsaPrincipal actor) {
        Instant now = clock.instant();
        Post post = Post.createDraft(Ids.newId(),
                command.title() == null || command.title().isBlank() ? "Untitled post" : command.title().trim(),
                actor.userId(), command.channelId(), now);
        posts.save(post);
        return detailOf(post);
    }

    @Transactional
    public PostDetailDto update(UUID postId, UpdateCommand command, KsaPrincipal actor) {
        Post post = requireOwned(postId, actor, true);

        // Optimistic concurrency: two editors on one draft get a clear conflict rather than a
        // silent last-write-wins (ARCHITECTURE.md 3.5).
        if (command.expectedConcurrencyToken() != null
                && command.expectedConcurrencyToken() != post.getOptimisticVersion()) {
            throw new ApiException(HttpStatus.PRECONDITION_FAILED, "POST_CONCURRENT_MODIFICATION",
                    "This post was changed elsewhere since you opened it. Reload before saving.");
        }

        String sanitizedHtml = command.bodyHtml() == null ? null : sanitizer.sanitize(command.bodyHtml());
        String plainText = sanitizedHtml == null ? null : sanitizer.toPlainText(sanitizedHtml);
        Priority priority = command.priority() == null ? null : Priority.valueOf(command.priority());

        post.applyEdit(command.title(), sanitizedHtml, plainText, priority, command.channelId(),
                actor.userId(), clock.instant());
        posts.save(post);
        return detailOf(post);
    }

    @Transactional
    public void softDelete(UUID postId, KsaPrincipal actor) {
        Post post = requireOwned(postId, actor, true);
        post.softDelete(actor.userId(), clock.instant());
        posts.save(post);
    }

    @Transactional(readOnly = true)
    public PostDetailDto read(UUID postId, KsaPrincipal actor) {
        Post post = requireVisible(postId, actor);
        return detailOf(post);
    }

    @Transactional(readOnly = true)
    public List<PostSummaryDto> list(KsaPrincipal actor, String statusFilter, boolean mineOnly) {
        List<Post> found = mineOnly || !actor.hasPermission("post:read:all")
                ? posts.findByAuthor(actor.userId())
                : posts.findAllActive();

        List<Post> filtered = statusFilter == null || statusFilter.isBlank()
                ? found
                : found.stream().filter(p -> p.getStatus().name().equalsIgnoreCase(statusFilter)).toList();

        Map<UUID, UserSummary> authors = users.findAll(filtered.stream().map(Post::getAuthorId).distinct().toList());
        Map<UUID, Channel> channelsById = channelIndex();

        return filtered.stream()
                .map(post -> mapper.toSummary(
                        post,
                        channelsById.get(post.getChannelId()),
                        authors.get(post.getAuthorId()),
                        (int) attachments.countActiveByPost(post.getId()),
                        null,
                        null))
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public PostDetailDto detail(UUID postId) {
        return detailOf(posts.findActive(postId).orElseThrow(PostService::notFound));
    }

    @Override
    @Transactional(readOnly = true)
    public PostVersionDto version(UUID versionId) {
        PostVersion version = versions.findById(versionId).orElseThrow(PostService::notFound);
        return mapper.toDto(version, users.find(version.getCreatedBy()).orElse(null),
                attachmentsFromManifest(version));
    }

    @Override
    @Transactional(readOnly = true)
    public List<PostVersionDto> versions(UUID postId) {
        return versions.findByPostIdOrderByVersionNoAsc(postId).stream()
                .map(version -> mapper.toDto(version, users.find(version.getCreatedBy()).orElse(null),
                        attachmentsFromManifest(version)))
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<AttachmentDto> attachments(UUID postId) {
        return attachments.findActiveByPost(postId).stream().map(mapper::toDto).toList();
    }

    // ---------------------------------------------------------------------------------------
    // Lifecycle, driven by the workflow module
    // ---------------------------------------------------------------------------------------

    @Override
    @Transactional
    public SubmissionSnapshot submitForReview(UUID postId, UUID actorId, Instant dueAt) {
        Post post = posts.findActive(postId).orElseThrow(PostService::notFound);
        Instant now = clock.instant();

        List<Attachment> media = attachments.findActiveByPost(postId);
        validateSubmittable(post, media);

        int versionNo = post.getCurrentVersionNo() + 1;
        PostVersion version = PostVersion.snapshot(Ids.newId(), post, versionNo,
                manifestJson(media), VersionReason.SUBMISSION, actorId, now);
        versions.save(version);

        post.markSubmitted(versionNo, dueAt, actorId, now);
        posts.save(post);
        return new SubmissionSnapshot(version.getId(), versionNo, post.getTitle());
    }

    @Override
    @Transactional
    public void applyDecision(UUID postId, DecisionOutcome outcome, UUID actorId) {
        Post post = posts.findActive(postId).orElseThrow(PostService::notFound);
        PostStatus status = switch (outcome) {
            case APPROVED -> PostStatus.APPROVED;
            case REJECTED -> PostStatus.REJECTED;
            case CHANGES_REQUESTED -> PostStatus.CHANGES_REQUESTED;
        };
        post.markDecided(status, actorId, clock.instant());
        posts.save(post);
    }

    @Override
    @Transactional
    public void withdrawFromReview(UUID postId, UUID actorId) {
        Post post = posts.findActive(postId).orElseThrow(PostService::notFound);
        post.markWithdrawn(actorId, clock.instant());
        posts.save(post);
    }

    /**
     * The gate in front of submission. Each failure names the thing to fix, because "validation
     * failed" tells an author nothing.
     */
    private void validateSubmittable(Post post, List<Attachment> media) {
        if (!post.getStatus().isSubmittable()) {
            throw new ApiException(HttpStatus.CONFLICT, "POST_INVALID_TRANSITION",
                    "A post in status " + post.getStatus() + " cannot be submitted for approval.");
        }
        if (post.getTitle() == null || post.getTitle().isBlank()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "POST_TITLE_REQUIRED",
                    "Add a title before submitting.");
        }
        if (post.getBodyText() == null || post.getBodyText().isBlank()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "POST_BODY_REQUIRED",
                    "Add content before submitting.");
        }
        List<Attachment> notReady = media.stream().filter(a -> !a.isReady()).toList();
        if (!notReady.isEmpty()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "ATTACHMENTS_NOT_READY",
                    notReady.size() + " attachment(s) are still being processed or were rejected. "
                            + "Remove them or wait for processing to finish.");
        }
        List<Attachment> missingAltText = media.stream()
                .filter(a -> a.getKind().name().equals("IMAGE"))
                .filter(a -> a.getAltText() == null || a.getAltText().isBlank())
                .toList();
        if (!missingAltText.isEmpty()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "ALT_TEXT_REQUIRED",
                    "Describe every image before submitting. Alt text is required for accessibility.");
        }
    }

    private PostDetailDto detailOf(Post post) {
        Channel channel = post.getChannelId() == null ? null : channels.findById(post.getChannelId()).orElse(null);
        return mapper.toDetail(post, channel, users.find(post.getAuthorId()).orElse(null),
                attachments.findActiveByPost(post.getId()));
    }

    /** The author may act; anyone with the broader permission may read. */
    private Post requireOwned(UUID postId, KsaPrincipal actor, boolean forWrite) {
        Post post = posts.findActive(postId).orElseThrow(PostService::notFound);
        boolean isAuthor = post.getAuthorId().equals(actor.userId());
        boolean mayWriteAnything = actor.hasPermission("post:update:any");
        if (forWrite && !isAuthor && !mayWriteAnything) {
            // 404 rather than 403: a user who may not touch this post has no business learning it exists.
            throw notFound();
        }
        return post;
    }

    private Post requireVisible(UUID postId, KsaPrincipal actor) {
        Post post = posts.findActive(postId).orElseThrow(PostService::notFound);
        boolean isAuthor = post.getAuthorId().equals(actor.userId());
        if (!isAuthor && !actor.hasPermission("post:read:all") && !actor.hasPermission("post:read:assigned")) {
            throw notFound();
        }
        return post;
    }

    private Map<UUID, Channel> channelIndex() {
        return channels.findAll().stream()
                .collect(java.util.stream.Collectors.toMap(Channel::getId, c -> c));
    }

    /** The exact attachment set a version carried, recorded so history cannot drift. */
    private String manifestJson(List<Attachment> media) {
        try {
            List<Map<String, Object>> entries = new ArrayList<>();
            for (Attachment attachment : media) {
                Map<String, Object> entry = new java.util.LinkedHashMap<>();
                entry.put("id", attachment.getId().toString());
                entry.put("filename", attachment.getOriginalFilename());
                entry.put("kind", attachment.getKind().name());
                entry.put("hash", attachment.getContentHash());
                entries.add(entry);
            }
            return objectMapper.writeValueAsString(entries);
        } catch (Exception e) {
            return "[]";
        }
    }

    private List<Attachment> attachmentsFromManifest(PostVersion version) {
        try {
            List<UUID> ids = new ArrayList<>();
            objectMapper.readTree(version.getAttachmentManifest())
                    .forEach(node -> ids.add(UUID.fromString(node.get("id").asText())));
            if (ids.isEmpty()) {
                return List.of();
            }
            Map<UUID, Integer> order = new java.util.HashMap<>();
            for (int i = 0; i < ids.size(); i++) {
                order.put(ids.get(i), i);
            }
            return attachments.findAllById(ids).stream()
                    .sorted(Comparator.comparing(a -> order.getOrDefault(a.getId(), Integer.MAX_VALUE)))
                    .toList();
        } catch (Exception e) {
            return List.of();
        }
    }

    Optional<Channel> channel(UUID channelId) {
        return channelId == null ? Optional.empty() : channels.findById(channelId);
    }

    static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "POST_NOT_FOUND", "No such post.");
    }
}
