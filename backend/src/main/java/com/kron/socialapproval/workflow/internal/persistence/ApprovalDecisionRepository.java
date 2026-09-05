package com.kron.socialapproval.workflow.internal.persistence;

import com.kron.socialapproval.workflow.internal.domain.ApprovalDecision;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ApprovalDecisionRepository extends JpaRepository<ApprovalDecision, UUID> {

    List<ApprovalDecision> findByApprovalRequestIdOrderByDecidedAtAsc(UUID approvalRequestId);

    List<ApprovalDecision> findByApprovalRequestIdInOrderByDecidedAtAsc(List<UUID> approvalRequestIds);
}
