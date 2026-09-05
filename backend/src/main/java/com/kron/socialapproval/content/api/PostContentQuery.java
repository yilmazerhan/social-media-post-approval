package com.kron.socialapproval.content.api;

import java.util.List;
import java.util.UUID;

/**
 * Read access to content for modules that display it — the approval review screen above all.
 * Nothing outside the content module touches its tables.
 */
public interface PostContentQuery {

    PostDetailDto detail(UUID postId);

    PostVersionDto version(UUID versionId);

    List<PostVersionDto> versions(UUID postId);

    List<AttachmentDto> attachments(UUID postId);
}
