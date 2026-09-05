package com.kron.socialapproval.ai.internal.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * One thing the model flagged. A reviewer can acknowledge it (I have seen this and taken it into
 * account) or dismiss it (this does not apply) — and either way the record keeps who did it.
 */
@Entity
@Table(name = "ai_finding")
public class AiFinding {

    @Id
    private UUID id;

    @Column(name = "ai_analysis_id", nullable = false)
    private UUID aiReviewId;

    @Column(nullable = false)
    private String category;

    @Column(nullable = false)
    private String severity;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "text")
    private String excerpt;

    @Column(nullable = false, columnDefinition = "text")
    private String explanation;

    @Column(columnDefinition = "text")
    private String suggestion;

    @Column(name = "acknowledged_by")
    private UUID acknowledgedBy;

    @Column(name = "acknowledged_at")
    private Instant acknowledgedAt;

    @Column(name = "dismissed_by")
    private UUID dismissedBy;

    @Column(name = "dismissed_at")
    private Instant dismissedAt;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    protected AiFinding() {
    }

    public static AiFinding of(UUID id, UUID reviewId, String category, String severity, String title,
                               String excerpt, String explanation, String suggestion, int sortOrder) {
        AiFinding finding = new AiFinding();
        finding.id = id;
        finding.aiReviewId = reviewId;
        finding.category = category;
        finding.severity = severity;
        finding.title = title;
        finding.excerpt = excerpt;
        finding.explanation = explanation;
        finding.suggestion = suggestion;
        finding.sortOrder = sortOrder;
        return finding;
    }

    public void acknowledge(UUID userId, Instant now) {
        this.acknowledgedBy = userId;
        this.acknowledgedAt = now;
        this.dismissedBy = null;
        this.dismissedAt = null;
    }

    public void dismiss(UUID userId, Instant now) {
        this.dismissedBy = userId;
        this.dismissedAt = now;
        this.acknowledgedBy = null;
        this.acknowledgedAt = null;
    }

    public UUID getId() {
        return id;
    }

    public UUID getAiReviewId() {
        return aiReviewId;
    }

    public String getCategory() {
        return category;
    }

    public String getSeverity() {
        return severity;
    }

    public String getTitle() {
        return title;
    }

    public String getExcerpt() {
        return excerpt;
    }

    public String getExplanation() {
        return explanation;
    }

    public String getSuggestion() {
        return suggestion;
    }

    public boolean isAcknowledged() {
        return acknowledgedAt != null;
    }

    public boolean isDismissed() {
        return dismissedAt != null;
    }

    public int getSortOrder() {
        return sortOrder;
    }
}
