package com.kron.socialapproval.content.internal.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * An immutable snapshot of a post's content, including the exact set of attachments it carried.
 *
 * <p>Nothing ever updates one of these rows. An approver's decision points at a version id, so the
 * question "what did they actually approve" always has an answer, even after ten more edits.
 */
@Entity
@Table(name = "post_version")
public class PostVersion {

    @Id
    private UUID id;

    @Column(name = "post_id", nullable = false)
    private UUID postId;

    @Column(name = "version_no", nullable = false)
    private int versionNo;

    @Column(nullable = false)
    private String title;

    @Column(name = "body_html", nullable = false)
    private String bodyHtml;

    @Column(name = "body_text", nullable = false)
    private String bodyText;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "attachment_manifest", nullable = false)
    private String attachmentManifest = "[]";

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private VersionReason reason;

    @Column(name = "created_by", nullable = false)
    private UUID createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    protected PostVersion() {
    }

    public static PostVersion snapshot(UUID id, Post post, int versionNo, String manifestJson,
                                       VersionReason reason, UUID actorId, Instant now) {
        PostVersion version = new PostVersion();
        version.id = id;
        version.postId = post.getId();
        version.versionNo = versionNo;
        version.title = post.getTitle();
        version.bodyHtml = post.getBodyHtml();
        version.bodyText = post.getBodyText();
        version.attachmentManifest = manifestJson;
        version.reason = reason;
        version.createdBy = actorId;
        version.createdAt = now;
        return version;
    }

    public UUID getId() {
        return id;
    }

    public UUID getPostId() {
        return postId;
    }

    public int getVersionNo() {
        return versionNo;
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

    public String getAttachmentManifest() {
        return attachmentManifest;
    }

    public VersionReason getReason() {
        return reason;
    }

    public UUID getCreatedBy() {
        return createdBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
