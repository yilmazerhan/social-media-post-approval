package com.kron.socialapproval.ai.internal.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "ai_analysis")
public class AiReview {

    @Id
    private UUID id;

    @Column(name = "post_id", nullable = false)
    private UUID postId;

    @Column(name = "post_version_id")
    private UUID postVersionId;

    @Column(nullable = false)
    private String provider;

    private String model;

    @Column(nullable = false)
    private String status;

    @Column(name = "risk_level")
    private String riskLevel;

    @Column(name = "risk_score")
    private Integer riskScore;

    @Column(columnDefinition = "text")
    private String summary;

    @Column(name = "prompt_tokens")
    private Integer promptTokens;

    @Column(name = "completion_tokens")
    private Integer completionTokens;

    @Column(name = "latency_ms")
    private Integer latencyMs;

    @Column(columnDefinition = "text")
    private String error;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "purge_after")
    private Instant purgeAfter;

    protected AiReview() {
    }

    public static AiReview started(UUID id, UUID postId, UUID versionId, String provider, Instant now) {
        AiReview review = new AiReview();
        review.id = id;
        review.postId = postId;
        review.postVersionId = versionId;
        review.provider = provider;
        review.status = "RUNNING";
        review.createdAt = now;
        return review;
    }

    public void completed(String model, String riskLevel, Integer riskScore, String summary,
                          Integer latencyMs, Instant now) {
        this.status = "COMPLETED";
        this.model = model;
        this.riskLevel = riskLevel;
        this.riskScore = riskScore;
        this.summary = summary;
        this.latencyMs = latencyMs;
        this.completedAt = now;
        this.purgeAfter = now.plus(java.time.Duration.ofDays(30));
    }

    /** Used when the provider is switched off or unreachable: the workflow never blocks on AI. */
    public void skipped(String reason, Instant now) {
        this.status = "SKIPPED";
        this.error = reason;
        this.completedAt = now;
    }

    public void failed(String reason, Instant now) {
        this.status = "FAILED";
        this.error = reason;
        this.completedAt = now;
    }

    public UUID getId() {
        return id;
    }

    public UUID getPostId() {
        return postId;
    }

    public UUID getPostVersionId() {
        return postVersionId;
    }

    public String getProvider() {
        return provider;
    }

    public String getModel() {
        return model;
    }

    public String getStatus() {
        return status;
    }

    public String getRiskLevel() {
        return riskLevel;
    }

    public Integer getRiskScore() {
        return riskScore;
    }

    public String getSummary() {
        return summary;
    }

    public Integer getLatencyMs() {
        return latencyMs;
    }

    public String getError() {
        return error;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }
}
