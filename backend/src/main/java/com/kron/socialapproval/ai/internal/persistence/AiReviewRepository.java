package com.kron.socialapproval.ai.internal.persistence;

import com.kron.socialapproval.ai.internal.domain.AiReview;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AiReviewRepository extends JpaRepository<AiReview, UUID> {

    Optional<AiReview> findFirstByPostIdOrderByCreatedAtDesc(UUID postId);

    Optional<AiReview> findFirstByPostVersionIdOrderByCreatedAtDesc(UUID postVersionId);

    List<AiReview> findByPostIdOrderByCreatedAtDesc(UUID postId);
}
