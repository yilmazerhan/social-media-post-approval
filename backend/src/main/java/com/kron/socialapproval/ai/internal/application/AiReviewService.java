package com.kron.socialapproval.ai.internal.application;

import com.kron.socialapproval.ai.api.AiReviewDto;
import com.kron.socialapproval.ai.api.AiReviewQuery;
import com.kron.socialapproval.ai.api.ContentReviewProvider;
import com.kron.socialapproval.ai.internal.domain.AiFinding;
import com.kron.socialapproval.ai.internal.domain.AiReview;
import com.kron.socialapproval.ai.internal.persistence.AiFindingRepository;
import com.kron.socialapproval.ai.internal.persistence.AiReviewRepository;
import com.kron.socialapproval.content.api.PostContentQuery;
import com.kron.socialapproval.content.api.PostDetailDto;
import com.kron.socialapproval.platform.config.KsaProperties;
import com.kron.socialapproval.platform.error.ApiException;
import com.kron.socialapproval.platform.security.KsaPrincipal;
import com.kron.socialapproval.platform.support.Ids;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Runs and stores advisory content reviews.
 *
 * <p>Nothing here can change a post's state. The service records what a provider said and who
 * acknowledged it; the decision stays with a person (ARCHITECTURE.md section 11.1).
 */
@Service
public class AiReviewService implements AiReviewQuery {

    private static final Logger log = LoggerFactory.getLogger(AiReviewService.class);

    private final AiReviewRepository reviews;
    private final AiFindingRepository findings;
    private final ContentReviewProvider provider;
    private final PostContentQuery content;
    private final KsaProperties properties;
    private final Clock clock;

    public AiReviewService(AiReviewRepository reviews, AiFindingRepository findings,
                           ContentReviewProvider provider, PostContentQuery content,
                           KsaProperties properties, Clock clock) {
        this.reviews = reviews;
        this.findings = findings;
        this.provider = provider;
        this.content = content;
        this.properties = properties;
        this.clock = clock;
    }

    @Transactional
    public AiReviewDto run(UUID postId, UUID versionId, KsaPrincipal actor) {
        PostDetailDto post = content.detail(postId);
        Instant now = clock.instant();
        AiReview review = AiReview.started(Ids.newId(), postId, versionId, provider.id(), now);

        if (!properties.getAi().isEnabled() || !provider.isAvailable()) {
            review.skipped("AI content review is not configured in this environment.", now);
            reviews.save(review);
            return toDto(review, List.of());
        }

        try {
            ContentReviewProvider.Result result = provider.review(new ContentReviewProvider.Request(
                    post.title(),
                    post.bodyText(),
                    post.channel() == null ? null : post.channel().code(),
                    "tr-TR"));

            if (result.error() != null) {
                review.skipped(result.error(), clock.instant());
                reviews.save(review);
                return toDto(review, List.of());
            }

            review.completed(result.model(), result.riskLevel(), result.riskScore(), result.summary(),
                    result.latencyMs(), clock.instant());
            reviews.save(review);

            List<AiFinding> stored = new java.util.ArrayList<>();
            int order = 0;
            for (ContentReviewProvider.Finding finding : result.findings()) {
                stored.add(findings.save(AiFinding.of(Ids.newId(), review.getId(), finding.category(),
                        finding.severity(), finding.title(), finding.excerpt(), finding.explanation(),
                        finding.suggestion(), order++)));
            }
            return toDto(review, stored);
        } catch (RuntimeException e) {
            // The workflow never blocks on AI availability: a failure is recorded and review continues.
            log.warn("AI review failed for post {}", postId, e);
            review.failed("The content check could not be completed.", clock.instant());
            reviews.save(review);
            return toDto(review, List.of());
        }
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<AiReviewDto> latestForPost(UUID postId) {
        return reviews.findFirstByPostIdOrderByCreatedAtDesc(postId).map(this::withFindings);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<AiReviewDto> forVersion(UUID postVersionId) {
        return reviews.findFirstByPostVersionIdOrderByCreatedAtDesc(postVersionId).map(this::withFindings);
    }

    @Transactional
    public AiReviewDto.AiFindingDto acknowledge(UUID findingId, KsaPrincipal actor) {
        AiFinding finding = requireFinding(findingId);
        finding.acknowledge(actor.userId(), clock.instant());
        return toDto(findings.save(finding));
    }

    @Transactional
    public AiReviewDto.AiFindingDto dismiss(UUID findingId, KsaPrincipal actor) {
        AiFinding finding = requireFinding(findingId);
        finding.dismiss(actor.userId(), clock.instant());
        return toDto(findings.save(finding));
    }

    private AiFinding requireFinding(UUID findingId) {
        return findings.findById(findingId).orElseThrow(() ->
                new ApiException(HttpStatus.NOT_FOUND, "AI_FINDING_NOT_FOUND", "No such finding."));
    }

    private AiReviewDto withFindings(AiReview review) {
        return toDto(review, findings.findByAiReviewIdOrderBySortOrderAsc(review.getId()));
    }

    private AiReviewDto toDto(AiReview review, List<AiFinding> reviewFindings) {
        return new AiReviewDto(
                review.getId(),
                review.getPostId(),
                review.getPostVersionId(),
                review.getProvider(),
                review.getModel(),
                review.getStatus(),
                review.getRiskLevel(),
                review.getRiskScore(),
                review.getSummary(),
                review.getLatencyMs(),
                review.getError(),
                review.getCreatedAt(),
                review.getCompletedAt(),
                reviewFindings.stream().map(AiReviewService::toDto).toList());
    }

    private static AiReviewDto.AiFindingDto toDto(AiFinding finding) {
        return new AiReviewDto.AiFindingDto(
                finding.getId(),
                finding.getCategory(),
                finding.getSeverity(),
                finding.getTitle(),
                finding.getExcerpt(),
                finding.getExplanation(),
                finding.getSuggestion(),
                finding.isAcknowledged(),
                finding.isDismissed());
    }
}
