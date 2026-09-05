package com.kron.socialapproval.collaboration.api;

import java.util.List;
import java.util.UUID;

/** Read access to the discussion attached to a post, for the review screen. */
public interface CommentQuery {

    List<CommentDto> threadFor(UUID postId, boolean includeInternal);
}
