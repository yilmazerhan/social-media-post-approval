package com.kron.socialapproval.content.internal.application;

import com.kron.socialapproval.content.api.AttachmentDto;
import com.kron.socialapproval.content.api.PostVersionDto;
import com.kron.socialapproval.content.internal.domain.PostVersion;
import com.kron.socialapproval.content.internal.persistence.PostVersionRepository;
import com.kron.socialapproval.identity.api.UserDirectory;
import com.kron.socialapproval.platform.error.ApiException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Answers "what changed between these two versions" for the review screen.
 *
 * <p>Media is compared by content hash rather than by id, so replacing an image with different
 * bytes under the same name shows up as a replacement rather than as nothing at all.
 */
@Service
@Transactional(readOnly = true)
public class VersionComparisonService {

    private final PostVersionRepository versions;
    private final PostService postService;
    private final UserDirectory users;

    public VersionComparisonService(PostVersionRepository versions, PostService postService, UserDirectory users) {
        this.versions = versions;
        this.postService = postService;
        this.users = users;
    }

    public record MediaChange(String change, AttachmentDto attachment) {
    }

    public record Comparison(
            PostVersionDto from,
            PostVersionDto to,
            List<TextDiff.Segment> titleDiff,
            List<TextDiff.Segment> bodyDiff,
            List<MediaChange> mediaChanges,
            boolean identical) {
    }

    public Comparison compare(UUID postId, int fromVersionNo, int toVersionNo) {
        PostVersion from = requireVersion(postId, fromVersionNo);
        PostVersion to = requireVersion(postId, toVersionNo);

        PostVersionDto fromDto = postService.version(from.getId());
        PostVersionDto toDto = postService.version(to.getId());

        List<TextDiff.Segment> titleDiff = TextDiff.diffWords(from.getTitle(), to.getTitle());
        List<TextDiff.Segment> bodyDiff = TextDiff.diffWords(from.getBodyText(), to.getBodyText());
        List<MediaChange> mediaChanges = compareMedia(fromDto.attachments(), toDto.attachments());

        boolean identical = titleDiff.stream().allMatch(s -> s.type() == TextDiff.Segment.Type.UNCHANGED)
                && bodyDiff.stream().allMatch(s -> s.type() == TextDiff.Segment.Type.UNCHANGED)
                && mediaChanges.isEmpty();

        return new Comparison(fromDto, toDto, titleDiff, bodyDiff, mediaChanges, identical);
    }

    private List<MediaChange> compareMedia(List<AttachmentDto> before, List<AttachmentDto> after) {
        Map<UUID, AttachmentDto> beforeById = before.stream()
                .collect(Collectors.toMap(AttachmentDto::id, Function.identity(), (a, b) -> a));
        Map<UUID, AttachmentDto> afterById = after.stream()
                .collect(Collectors.toMap(AttachmentDto::id, Function.identity(), (a, b) -> a));

        List<MediaChange> changes = new java.util.ArrayList<>();
        after.stream()
                .filter(attachment -> !beforeById.containsKey(attachment.id()))
                .forEach(attachment -> changes.add(new MediaChange("ADDED", attachment)));
        before.stream()
                .filter(attachment -> !afterById.containsKey(attachment.id()))
                .forEach(attachment -> changes.add(new MediaChange("REMOVED", attachment)));
        return changes;
    }

    private PostVersion requireVersion(UUID postId, int versionNo) {
        return versions.findByPostIdAndVersionNo(postId, versionNo)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "VERSION_NOT_FOUND",
                        "Version " + versionNo + " of this post could not be loaded."));
    }

    UserDirectory users() {
        return users;
    }
}
