package com.kron.socialapproval.workflow.internal.persistence;

import com.kron.socialapproval.workflow.internal.domain.ApprovalStep;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ApprovalStepRepository extends JpaRepository<ApprovalStep, UUID> {

    List<ApprovalStep> findByApprovalRequestIdOrderByStepNoAsc(UUID approvalRequestId);

    Optional<ApprovalStep> findByApprovalRequestIdAndAssigneeId(UUID approvalRequestId, UUID assigneeId);

    List<ApprovalStep> findByApprovalRequestIdIn(List<UUID> approvalRequestIds);
}
