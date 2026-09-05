package com.kron.socialapproval.ai.internal.persistence;

import com.kron.socialapproval.ai.internal.domain.AiFinding;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AiFindingRepository extends JpaRepository<AiFinding, UUID> {

    List<AiFinding> findByAiReviewIdOrderBySortOrderAsc(UUID aiReviewId);
}
