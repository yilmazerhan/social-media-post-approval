package com.kron.socialapproval.collaboration.internal.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "post_comment")
public class Comment {

    @Id
    private UUID id;

    @Column(name = "post_id", nullable = false)
    private UUID postId;

    @Column(name = "approval_request_id")
    private UUID approvalRequestId;

    @Column(name = "parent_comment_id")
    private UUID parentCommentId;

    @Column(name = "author_id", nullable = false)
    private UUID authorId;

    @Column(nullable = false, columnDefinition = "text")
    private String body;

    /** An approver-only note, invisible to the author. Used sparingly and labelled in the UI. */
    @Column(name = "is_internal", nullable = false)
    private boolean internal;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "edited_at")
    private Instant editedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    protected Comment() {
    }

    public static Comment of(UUID id, UUID postId, UUID approvalRequestId, UUID parentCommentId,
                             UUID authorId, String body, boolean internal, Instant now) {
        Comment comment = new Comment();
        comment.id = id;
        comment.postId = postId;
        comment.approvalRequestId = approvalRequestId;
        comment.parentCommentId = parentCommentId;
        comment.authorId = authorId;
        comment.body = body;
        comment.internal = internal;
        comment.createdAt = now;
        return comment;
    }

    public void softDelete(Instant now) {
        this.deletedAt = now;
    }

    public UUID getId() {
        return id;
    }

    public UUID getPostId() {
        return postId;
    }

    public UUID getParentCommentId() {
        return parentCommentId;
    }

    public UUID getAuthorId() {
        return authorId;
    }

    public String getBody() {
        return body;
    }

    public boolean isInternal() {
        return internal;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getEditedAt() {
        return editedAt;
    }
}
