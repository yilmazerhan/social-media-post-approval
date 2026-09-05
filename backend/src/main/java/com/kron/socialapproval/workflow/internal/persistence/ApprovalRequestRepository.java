package com.kron.socialapproval.workflow.internal.persistence;

import com.kron.socialapproval.workflow.internal.domain.ApprovalRequest;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ApprovalRequestRepository extends JpaRepository<ApprovalRequest, UUID> {

    List<ApprovalRequest> findByPostIdOrderByRequestedAtAsc(UUID postId);

    @Query("SELECT r FROM ApprovalRequest r WHERE r.postId = :postId AND r.status = 'PENDING'")
    Optional<ApprovalRequest> findOpenByPost(@Param("postId") UUID postId);

    @Query("SELECT r FROM ApprovalRequest r WHERE r.status = 'PENDING' ORDER BY r.dueAt ASC")
    List<ApprovalRequest> findAllOpen();

    @Query("""
           SELECT r FROM ApprovalRequest r
            WHERE r.id IN (SELECT s.approvalRequestId FROM ApprovalStep s WHERE s.assigneeId = :assigneeId)
            ORDER BY r.dueAt ASC
           """)
    List<ApprovalRequest> findAssignedTo(@Param("assigneeId") UUID assigneeId);
}
