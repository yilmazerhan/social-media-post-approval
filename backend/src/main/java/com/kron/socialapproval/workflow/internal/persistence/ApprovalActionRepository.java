package com.kron.socialapproval.workflow.internal.persistence;

import com.kron.socialapproval.workflow.internal.domain.ApprovalAction;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ApprovalActionRepository extends JpaRepository<ApprovalAction, UUID> {

    List<ApprovalAction> findByApprovalRequestIdOrderByPerformedAtAsc(UUID approvalRequestId);

    List<ApprovalAction> findByApprovalRequestIdInOrderByPerformedAtAsc(List<UUID> approvalRequestIds);
}
