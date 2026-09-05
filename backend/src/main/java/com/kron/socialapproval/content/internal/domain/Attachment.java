package com.kron.socialapproval.content.internal.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "attachment")
public class Attachment {

    @Id
    private UUID id;

    @Column(name = "post_id", nullable = false)
    private UUID postId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AttachmentKind kind;

    @Column(name = "original_filename", nullable = false)
    private String originalFilename;

    @Column(name = "content_type_declared", nullable = false)
    private String contentTypeDeclared;

    @Column(name = "content_type_detected")
    private String contentTypeDetected;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(name = "content_hash")
    private String contentHash;

    @Column(name = "storage_bucket", nullable = false)
    private String storageBucket;

    @Column(name = "storage_key", nullable = false)
    private String storageKey;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AttachmentStatus status = AttachmentStatus.PENDING;

    @Column(name = "scan_result")
    private String scanResult;

    private Integer width;

    private Integer height;

    @Column(name = "duration_seconds")
    private Integer durationSeconds;

    @Column(name = "alt_text")
    private String altText;

    private String caption;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(name = "uploaded_by", nullable = false)
    private UUID uploadedBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "deleted_at")
    private Instant deletedAt;

    protected Attachment() {
    }

    public static Attachment pending(UUID id, UUID postId, AttachmentKind kind, String filename,
                                     String declaredType, long declaredSize, String bucket, String key,
                                     int sortOrder, UUID uploadedBy, Instant now) {
        Attachment attachment = new Attachment();
        attachment.id = id;
        attachment.postId = postId;
        attachment.kind = kind;
        attachment.originalFilename = filename;
        attachment.contentTypeDeclared = declaredType;
        attachment.sizeBytes = declaredSize;
        attachment.storageBucket = bucket;
        attachment.storageKey = key;
        attachment.sortOrder = sortOrder;
        attachment.uploadedBy = uploadedBy;
        attachment.createdAt = now;
        return attachment;
    }

    /** Called once the bytes have arrived and the real content type has been sniffed. */
    public void markUploaded(String detectedType, long actualSize, String hash,
                             Integer width, Integer height, Integer durationSeconds) {
        this.contentTypeDetected = detectedType;
        this.sizeBytes = actualSize;
        this.contentHash = hash;
        this.width = width;
        this.height = height;
        this.durationSeconds = durationSeconds;
        this.status = AttachmentStatus.UPLOADED;
    }

    public void markScanning() {
        this.status = AttachmentStatus.SCANNING;
    }

    public void markReady(String scanResult) {
        this.status = AttachmentStatus.READY;
        this.scanResult = scanResult;
    }

    public void markQuarantined(String reason) {
        this.status = AttachmentStatus.QUARANTINED;
        this.scanResult = reason;
    }

    public void markFailed(String reason) {
        this.status = AttachmentStatus.FAILED;
        this.scanResult = reason;
    }

    public void describe(String altText, String caption, Integer sortOrder) {
        if (altText != null) {
            this.altText = altText;
        }
        if (caption != null) {
            this.caption = caption;
        }
        if (sortOrder != null) {
            this.sortOrder = sortOrder;
        }
    }

    public void softDelete(Instant now) {
        this.deletedAt = now;
    }

    public boolean isReady() {
        return status == AttachmentStatus.READY;
    }

    public UUID getId() {
        return id;
    }

    public UUID getPostId() {
        return postId;
    }

    public AttachmentKind getKind() {
        return kind;
    }

    public String getOriginalFilename() {
        return originalFilename;
    }

    public String getContentTypeDeclared() {
        return contentTypeDeclared;
    }

    public String getContentTypeDetected() {
        return contentTypeDetected;
    }

    public long getSizeBytes() {
        return sizeBytes;
    }

    public String getContentHash() {
        return contentHash;
    }

    public String getStorageBucket() {
        return storageBucket;
    }

    public String getStorageKey() {
        return storageKey;
    }

    public AttachmentStatus getStatus() {
        return status;
    }

    public String getScanResult() {
        return scanResult;
    }

    public Integer getWidth() {
        return width;
    }

    public Integer getHeight() {
        return height;
    }

    public Integer getDurationSeconds() {
        return durationSeconds;
    }

    public String getAltText() {
        return altText;
    }

    public String getCaption() {
        return caption;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public UUID getUploadedBy() {
        return uploadedBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
