package com.kron.socialapproval.ai.internal.web;

import com.kron.socialapproval.access.api.Permissions;
import com.kron.socialapproval.ai.api.AiReviewDto;
import com.kron.socialapproval.ai.internal.application.AiReviewService;
import com.kron.socialapproval.platform.security.KsaPrincipal;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class AiReviewController {

    private final AiReviewService reviews;

    public AiReviewController(AiReviewService reviews) {
        this.reviews = reviews;
    }

    @GetMapping("/posts/{postId}/ai-review")
    @PreAuthorize("hasAuthority('" + Permissions.AI_REVIEW_READ + "')")
    public ResponseEntity<AiReviewDto> latest(@PathVariable UUID postId) {
        return reviews.latestForPost(postId).map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.noContent().build());
    }

    /** Explicit user action. Nothing runs a check behind the author's back. */
    @PostMapping("/posts/{postId}/ai-review")
    @PreAuthorize("hasAuthority('" + Permissions.AI_REVIEW_RUN + "')")
    public AiReviewDto run(@PathVariable UUID postId,
                           @RequestParam(required = false) UUID versionId,
                           @AuthenticationPrincipal KsaPrincipal principal) {
        return reviews.run(postId, versionId, principal);
    }

    @PostMapping("/ai-findings/{findingId}/acknowledge")
    @PreAuthorize("hasAuthority('" + Permissions.AI_FINDING_RESOLVE + "')")
    public AiReviewDto.AiFindingDto acknowledge(@PathVariable UUID findingId,
                                                @AuthenticationPrincipal KsaPrincipal principal) {
        return reviews.acknowledge(findingId, principal);
    }

    @PostMapping("/ai-findings/{findingId}/dismiss")
    @PreAuthorize("hasAuthority('" + Permissions.AI_FINDING_RESOLVE + "')")
    public AiReviewDto.AiFindingDto dismiss(@PathVariable UUID findingId,
                                            @AuthenticationPrincipal KsaPrincipal principal) {
        return reviews.dismiss(findingId, principal);
    }
}
