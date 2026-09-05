package com.kron.socialapproval.content.internal.domain;

import com.kron.socialapproval.platform.error.ApiException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;
import org.springframework.http.HttpStatus;

/**
 * A piece of corporate content and its position in the approval lifecycle.
 *
 * <p>State transitions are methods on this class, not statements scattered through services. Each
 * one refuses an illegal move rather than trusting the caller to have checked, so there is exactly
 * one place to read to know what can happen to a post.
 */
@Entity
@Table(name = "post")
public class Post {

    @Id
    private UUID id;

    @Column(nullable = false)
    private String title;

    @Column(name = "body_html", nullable = false)
    private String bodyHtml = "";

    @Column(name = "body_text", nullable = false)
    private String bodyText = "";

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PostStatus status = PostStatus.DRAFT;

    @Column(name = "author_id", nullable = false)
    private UUID authorId;

    @Column(name = "channel_id")
    private UUID channelId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Priority priority = Priority.NORMAL;

    @Column(name = "current_version_no", nullable = false)
    private int currentVersionNo;

    @Column(name = "submitted_at")
    private Instant submittedAt;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @Column(name = "published_at")
    private Instant publishedAt;

    @Column(name = "due_at")
    private Instant dueAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "sla_state", nullable = false)
    private SlaState slaState = SlaState.NONE;

    @Version
    @Column(name = "optimistic_version", nullable = false)
    private long optimisticVersion;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Column(name = "updated_by")
    private UUID updatedBy;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    protected Post() {
    }

    public static Post createDraft(UUID id, String title, UUID authorId, UUID channelId, Instant now) {
        Post post = new Post();
        post.id = id;
        post.title = title;
        post.authorId = authorId;
        post.channelId = channelId;
        post.status = PostStatus.DRAFT;
        post.createdAt = now;
        post.createdBy = authorId;
        post.updatedAt = now;
        post.updatedBy = authorId;
        return post;
    }

    /**
     * Applies an author edit. A post whose reviewer asked for changes moves back to
     * {@link PostStatus#DRAFT} on the first edit, which is what makes "editing version 3" honest:
     * the previously submitted version stays untouched.
     */
    public void applyEdit(String title, String bodyHtml, String bodyText, Priority priority,
                          UUID channelId, UUID actorId, Instant now) {
        if (!status.isEditable()) {
            throw new ApiException(HttpStatus.CONFLICT, "POST_NOT_EDITABLE",
                    status == PostStatus.IN_REVIEW
                            ? "This post is being reviewed. Withdraw it first if you need to change it."
                            : "A post in status " + status + " can no longer be edited.");
        }
        if (title != null) {
            this.title = title;
        }
        if (bodyHtml != null) {
            this.bodyHtml = bodyHtml;
            this.bodyText = bodyText == null ? "" : bodyText;
        }
        if (priority != null) {
            this.priority = priority;
        }
        if (channelId != null) {
            this.channelId = channelId;
        }
        if (status == PostStatus.CHANGES_REQUESTED || status == PostStatus.REJECTED) {
            this.status = PostStatus.DRAFT;
        }
        touch(actorId, now);
    }

    public void markSubmitted(int versionNo, Instant dueAt, UUID actorId, Instant now) {
        if (!status.isSubmittable()) {
            throw new ApiException(HttpStatus.CONFLICT, "POST_INVALID_TRANSITION",
                    "A post in status " + status + " cannot be submitted for approval.");
        }
        this.status = PostStatus.IN_REVIEW;
        this.currentVersionNo = versionNo;
        this.submittedAt = now;
        this.decidedAt = null;
        this.dueAt = dueAt;
        this.slaState = SlaState.ON_TRACK;
        touch(actorId, now);
    }

    public void markWithdrawn(UUID actorId, Instant now) {
        if (status != PostStatus.IN_REVIEW) {
            throw new ApiException(HttpStatus.CONFLICT, "POST_INVALID_TRANSITION",
                    "Only a post awaiting review can be withdrawn.");
        }
        this.status = PostStatus.DRAFT;
        this.dueAt = null;
        this.slaState = SlaState.NONE;
        touch(actorId, now);
    }

    public void markDecided(PostStatus outcome, UUID actorId, Instant now) {
        if (status != PostStatus.IN_REVIEW) {
            throw new ApiException(HttpStatus.CONFLICT, "POST_INVALID_TRANSITION",
                    "This post is not awaiting a decision.");
        }
        this.status = outcome;
        this.decidedAt = now;
        this.dueAt = null;
        this.slaState = SlaState.NONE;
        touch(actorId, now);
    }

    public void recordVersion(int versionNo) {
        this.currentVersionNo = versionNo;
    }

    public void updateSlaState(SlaState state) {
        this.slaState = state;
    }

    public void softDelete(UUID actorId, Instant now) {
        if (status == PostStatus.IN_REVIEW) {
            throw new ApiException(HttpStatus.CONFLICT, "POST_INVALID_TRANSITION",
                    "Withdraw the post from review before deleting it.");
        }
        this.deletedAt = now;
        touch(actorId, now);
    }

    private void touch(UUID actorId, Instant now) {
        this.updatedBy = actorId;
        this.updatedAt = now;
    }

    public UUID getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public String getBodyHtml() {
        return bodyHtml;
    }

    public String getBodyText() {
        return bodyText;
    }

    public PostStatus getStatus() {
        return status;
    }

    public UUID getAuthorId() {
        return authorId;
    }

    public UUID getChannelId() {
        return channelId;
    }

    public Priority getPriority() {
        return priority;
    }

    public int getCurrentVersionNo() {
        return currentVersionNo;
    }

    public Instant getSubmittedAt() {
        return submittedAt;
    }

    public Instant getDecidedAt() {
        return decidedAt;
    }

    public Instant getPublishedAt() {
        return publishedAt;
    }

    public Instant getDueAt() {
        return dueAt;
    }

    public SlaState getSlaState() {
        return slaState;
    }

    public long getOptimisticVersion() {
        return optimisticVersion;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public UUID getUpdatedBy() {
        return updatedBy;
    }

    public Instant getDeletedAt() {
        return deletedAt;
    }
}
