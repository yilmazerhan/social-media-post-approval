package com.kron.socialapproval.workflow.internal.web;

import com.kron.socialapproval.access.api.Permissions;
import com.kron.socialapproval.platform.security.KsaPrincipal;
import com.kron.socialapproval.workflow.api.ApprovalDtos;
import com.kron.socialapproval.workflow.internal.application.ApprovalService;
import com.kron.socialapproval.workflow.internal.application.SubmissionService;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Submission lives with the workflow rather than with the content module: it is the act of handing
 * responsibility to someone else, not an edit.
 */
@RestController
@RequestMapping("/api/v1/posts/{postId}")
public class SubmissionController {

    private final SubmissionService submissions;
    private final ApprovalService approvals;

    public SubmissionController(SubmissionService submissions, ApprovalService approvals) {
        this.submissions = submissions;
        this.approvals = approvals;
    }

    public record SubmitRequest(List<UUID> approverIds, String mode, String note, Instant dueAt) {
    }

    @PostMapping("/submit")
    @PreAuthorize("hasAuthority('" + Permissions.POST_SUBMIT + "')")
    public SubmissionService.SubmitResult submit(@PathVariable UUID postId,
                                                 @RequestBody(required = false) SubmitRequest request,
                                                 @AuthenticationPrincipal KsaPrincipal principal) {
        SubmitRequest safe = request == null ? new SubmitRequest(null, null, null, null) : request;
        return submissions.submit(postId,
                new SubmissionService.SubmitCommand(safe.approverIds(), safe.mode(), safe.note(), safe.dueAt()),
                principal);
    }

    @PostMapping("/withdraw")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAuthority('" + Permissions.POST_WITHDRAW + "')")
    public void withdraw(@PathVariable UUID postId, @AuthenticationPrincipal KsaPrincipal principal) {
        submissions.withdraw(postId, principal);
    }

    /** The author's view of their own post's history — the same entries the reviewer sees. */
    @GetMapping("/timeline")
    @PreAuthorize("hasAuthority('" + Permissions.POST_READ_OWN + "')")
    public List<ApprovalDtos.TimelineEntry> timeline(@PathVariable UUID postId) {
        return approvals.timelineFor(postId);
    }
}
