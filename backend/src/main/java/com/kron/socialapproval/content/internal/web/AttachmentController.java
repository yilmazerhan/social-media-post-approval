package com.kron.socialapproval.content.internal.web;

import com.kron.socialapproval.access.api.Permissions;
import com.kron.socialapproval.content.api.AttachmentDto;
import com.kron.socialapproval.content.internal.application.AttachmentService;
import com.kron.socialapproval.media.api.BlobContent;
import com.kron.socialapproval.platform.security.KsaPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.io.IOException;
import java.util.List;
import java.util.UUID;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Media endpoints. Uploads follow ask, send, confirm — the shape stays the same whether the bytes
 * go straight to object storage or through the application (ARCHITECTURE.md section 7.3).
 */
@RestController
@RequestMapping("/api/v1")
public class AttachmentController {

    private final AttachmentService attachments;

    public AttachmentController(AttachmentService attachments) {
        this.attachments = attachments;
    }

    public record PresignRequest(@NotBlank String filename, @NotBlank String contentType, long sizeBytes) {
    }

    public record CompleteRequest(Integer durationSeconds) {
    }

    public record DescribeRequest(String altText, String caption, Integer sortOrder) {
    }

    @GetMapping("/posts/{postId}/attachments")
    @PreAuthorize("hasAuthority('" + Permissions.ATTACHMENT_DOWNLOAD + "')")
    public List<AttachmentDto> list(@PathVariable UUID postId) {
        return attachments.list(postId);
    }

    @PostMapping("/posts/{postId}/attachments/presign")
    @PreAuthorize("hasAuthority('" + Permissions.ATTACHMENT_UPLOAD + "')")
    public AttachmentService.PresignResult presign(@PathVariable UUID postId,
                                                   @RequestBody @Valid PresignRequest request,
                                                   @AuthenticationPrincipal KsaPrincipal principal) {
        return attachments.presign(postId,
                new AttachmentService.PresignCommand(request.filename(), request.contentType(), request.sizeBytes()),
                principal);
    }

    /** Receives the bytes when the storage backend cannot accept a direct browser upload. */
    @PutMapping("/attachments/{id}/content")
    @PreAuthorize("hasAuthority('" + Permissions.ATTACHMENT_UPLOAD + "')")
    public AttachmentDto upload(@PathVariable UUID id, HttpServletRequest request,
                                @AuthenticationPrincipal KsaPrincipal principal) throws IOException {
        return attachments.storeContent(id, request.getInputStream(), principal);
    }

    @PostMapping("/attachments/{id}/complete")
    @PreAuthorize("hasAuthority('" + Permissions.ATTACHMENT_UPLOAD + "')")
    public AttachmentDto complete(@PathVariable UUID id, @RequestBody(required = false) CompleteRequest request,
                                  @AuthenticationPrincipal KsaPrincipal principal) {
        return attachments.complete(id,
                new AttachmentService.CompleteCommand(request == null ? null : request.durationSeconds()),
                principal);
    }

    @PatchMapping("/attachments/{id}")
    @PreAuthorize("hasAuthority('" + Permissions.ATTACHMENT_UPLOAD + "')")
    public AttachmentDto describe(@PathVariable UUID id, @RequestBody DescribeRequest request,
                                  @AuthenticationPrincipal KsaPrincipal principal) {
        return attachments.describe(id,
                new AttachmentService.DescribeCommand(request.altText(), request.caption(), request.sortOrder()),
                principal);
    }

    @DeleteMapping("/attachments/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAuthority('" + Permissions.ATTACHMENT_DELETE + "')")
    public void remove(@PathVariable UUID id, @AuthenticationPrincipal KsaPrincipal principal) {
        attachments.remove(id, principal);
    }

    @GetMapping("/attachments/{id}/content")
    @PreAuthorize("hasAuthority('" + Permissions.ATTACHMENT_DOWNLOAD + "')")
    public ResponseEntity<Resource> content(@PathVariable UUID id,
                                            @AuthenticationPrincipal KsaPrincipal principal) {
        BlobContent blob = attachments.content(id, principal);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(blob.contentType()))
                .contentLength(blob.sizeBytes())
                // Never inline: a stored file must not be able to execute against the app origin.
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"attachment\"")
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CACHE_CONTROL, "private, max-age=300")
                .body(blob.resource());
    }
}
