package com.kron.socialapproval.workflow.internal.web;

import com.kron.socialapproval.access.api.Permissions;
import com.kron.socialapproval.platform.security.KsaPrincipal;
import com.kron.socialapproval.workflow.api.ApprovalDtos;
import com.kron.socialapproval.workflow.internal.application.ApprovalService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** The approver's screens: the queue, one review, and the decision. */
@RestController
@RequestMapping("/api/v1/approvals")
public class ApprovalController {

    private final ApprovalService approvals;

    public ApprovalController(ApprovalService approvals) {
        this.approvals = approvals;
    }

    public record DecisionRequest(
            @NotBlank String decision,
            String comment,
            Integer expectedVersionNo) {
    }

    @GetMapping
    @PreAuthorize("hasAuthority('" + Permissions.APPROVAL_READ_ASSIGNED + "')")
    public List<ApprovalDtos.ApprovalSummary> queue(@AuthenticationPrincipal KsaPrincipal principal,
                                                    @RequestParam(defaultValue = "true") boolean open) {
        return approvals.queue(principal, open);
    }

    /** Everything the review screen needs, in one request. */
    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('" + Permissions.APPROVAL_READ_ASSIGNED + "')")
    public ApprovalDtos.ApprovalReview review(@PathVariable UUID id,
                                              @AuthenticationPrincipal KsaPrincipal principal) {
        return approvals.review(id, principal);
    }

    @GetMapping("/{id}/neighbours")
    @PreAuthorize("hasAuthority('" + Permissions.APPROVAL_READ_ASSIGNED + "')")
    public ApprovalDtos.Neighbours neighbours(@PathVariable UUID id,
                                              @AuthenticationPrincipal KsaPrincipal principal) {
        return approvals.neighbours(id, principal);
    }

    @PostMapping("/{id}/decisions")
    @PreAuthorize("hasAuthority('" + Permissions.APPROVAL_DECIDE + "')")
    public ApprovalDtos.ApprovalReview decide(@PathVariable UUID id,
                                              @RequestBody @jakarta.validation.Valid DecisionRequest request,
                                              @AuthenticationPrincipal KsaPrincipal principal,
                                              HttpServletRequest httpRequest) {
        return approvals.decide(id, new ApprovalService.DecisionCommand(
                request.decision(), request.comment(), request.expectedVersionNo(),
                httpRequest.getRemoteAddr()), principal);
    }
}
