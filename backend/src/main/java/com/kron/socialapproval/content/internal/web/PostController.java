package com.kron.socialapproval.content.internal.web;

import com.kron.socialapproval.access.api.Permissions;
import com.kron.socialapproval.content.api.PostDetailDto;
import com.kron.socialapproval.content.api.PostSummaryDto;
import com.kron.socialapproval.content.api.PostVersionDto;
import com.kron.socialapproval.content.internal.application.PostService;
import com.kron.socialapproval.content.internal.application.VersionComparisonService;
import com.kron.socialapproval.platform.security.KsaPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/posts")
public class PostController {

    private final PostService posts;
    private final VersionComparisonService comparisons;

    public PostController(PostService posts, VersionComparisonService comparisons) {
        this.posts = posts;
        this.comparisons = comparisons;
    }

    public record CreatePostRequest(@Size(max = 300) String title, UUID channelId) {
    }

    public record UpdatePostRequest(
            @Size(max = 300) String title,
            String bodyHtml,
            String priority,
            UUID channelId,
            Long concurrencyToken) {
    }

    @GetMapping
    @PreAuthorize("hasAuthority('" + Permissions.POST_READ_OWN + "')")
    public List<PostSummaryDto> list(@AuthenticationPrincipal KsaPrincipal principal,
                                     @RequestParam(required = false) String status,
                                     @RequestParam(defaultValue = "true") boolean mine) {
        return posts.list(principal, status, mine);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('" + Permissions.POST_CREATE + "')")
    public PostDetailDto create(@RequestBody @Valid CreatePostRequest request,
                                @AuthenticationPrincipal KsaPrincipal principal) {
        return posts.create(new PostService.CreateCommand(request.title(), request.channelId()), principal);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('" + Permissions.POST_READ_OWN + "')")
    public PostDetailDto read(@PathVariable UUID id, @AuthenticationPrincipal KsaPrincipal principal) {
        return posts.read(id, principal);
    }

    @PatchMapping("/{id}")
    @PreAuthorize("hasAuthority('" + Permissions.POST_UPDATE_OWN + "')")
    public PostDetailDto update(@PathVariable UUID id, @RequestBody @Valid UpdatePostRequest request,
                                @AuthenticationPrincipal KsaPrincipal principal) {
        return posts.update(id, new PostService.UpdateCommand(request.title(), request.bodyHtml(),
                request.priority(), request.channelId(), request.concurrencyToken()), principal);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAuthority('" + Permissions.POST_DELETE_OWN + "')")
    public void delete(@PathVariable UUID id, @AuthenticationPrincipal KsaPrincipal principal) {
        posts.softDelete(id, principal);
    }

    @GetMapping("/{id}/versions")
    @PreAuthorize("hasAuthority('" + Permissions.POST_READ_OWN + "')")
    public List<PostVersionDto> versions(@PathVariable UUID id, @AuthenticationPrincipal KsaPrincipal principal) {
        posts.read(id, principal);
        return posts.versions(id);
    }

    /** Powers the side-by-side comparison on the review screen. */
    @GetMapping("/{id}/versions/compare")
    @PreAuthorize("hasAuthority('" + Permissions.POST_READ_OWN + "')")
    public VersionComparisonService.Comparison compare(@PathVariable UUID id,
                                                       @RequestParam int from,
                                                       @RequestParam int to,
                                                       @AuthenticationPrincipal KsaPrincipal principal) {
        posts.read(id, principal);
        return comparisons.compare(id, from, to);
    }
}
