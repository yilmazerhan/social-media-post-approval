package com.kron.socialapproval.collaboration.internal.web;

import com.kron.socialapproval.access.api.Permissions;
import com.kron.socialapproval.collaboration.api.CommentDto;
import com.kron.socialapproval.collaboration.internal.application.CommentService;
import com.kron.socialapproval.platform.security.KsaPrincipal;
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
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/posts/{postId}/comments")
public class CommentController {

    private final CommentService comments;

    public CommentController(CommentService comments) {
        this.comments = comments;
    }

    public record AddCommentRequest(@NotBlank String body, UUID parentCommentId, boolean internal) {
    }

    @GetMapping
    @PreAuthorize("hasAuthority('" + Permissions.COMMENT_READ + "')")
    public List<CommentDto> list(@PathVariable UUID postId, @AuthenticationPrincipal KsaPrincipal principal) {
        return comments.threadFor(postId, principal.hasPermission(Permissions.APPROVAL_DECIDE));
    }

    @PostMapping
    @PreAuthorize("hasAuthority('" + Permissions.COMMENT_CREATE + "')")
    public CommentDto add(@PathVariable UUID postId,
                          @RequestBody @jakarta.validation.Valid AddCommentRequest request,
                          @AuthenticationPrincipal KsaPrincipal principal) {
        return comments.add(postId, null, request.parentCommentId(), request.body(),
                request.internal() && principal.hasPermission(Permissions.APPROVAL_DECIDE), principal);
    }
}
