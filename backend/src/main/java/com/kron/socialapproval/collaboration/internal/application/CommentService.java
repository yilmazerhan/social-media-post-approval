package com.kron.socialapproval.collaboration.internal.application;

import com.kron.socialapproval.collaboration.api.CommentDto;
import com.kron.socialapproval.collaboration.api.CommentQuery;
import com.kron.socialapproval.collaboration.internal.domain.Comment;
import com.kron.socialapproval.collaboration.internal.persistence.CommentRepository;
import com.kron.socialapproval.identity.api.UserDirectory;
import com.kron.socialapproval.identity.api.UserSummary;
import com.kron.socialapproval.platform.error.ApiException;
import com.kron.socialapproval.platform.security.KsaPrincipal;
import com.kron.socialapproval.platform.support.Ids;
import java.time.Clock;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The review discussion. Comment bodies are stored and rendered as plain text: a thread attached to
 * content under governance is not a place to accept markup.
 */
@Service
public class CommentService implements CommentQuery {

    private static final int MAX_LENGTH = 4000;

    private final CommentRepository comments;
    private final UserDirectory users;
    private final Clock clock;

    public CommentService(CommentRepository comments, UserDirectory users, Clock clock) {
        this.comments = comments;
        this.users = users;
        this.clock = clock;
    }

    @Transactional
    public CommentDto add(UUID postId, UUID approvalRequestId, UUID parentCommentId, String body,
                          boolean internal, KsaPrincipal actor) {
        String trimmed = body == null ? "" : body.trim();
        if (trimmed.isEmpty()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "COMMENT_EMPTY", "Write something first.");
        }
        if (trimmed.length() > MAX_LENGTH) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "COMMENT_TOO_LONG",
                    "A comment can be at most " + MAX_LENGTH + " characters.");
        }
        Comment comment = Comment.of(Ids.newId(), postId, approvalRequestId, parentCommentId,
                actor.userId(), trimmed, internal, clock.instant());
        return toDto(comments.save(comment), users.find(actor.userId()).orElse(null), List.of());
    }

    @Override
    @Transactional(readOnly = true)
    public List<CommentDto> threadFor(UUID postId, boolean includeInternal) {
        List<Comment> all = comments.findActiveByPost(postId).stream()
                .filter(comment -> includeInternal || !comment.isInternal())
                .toList();
        Map<UUID, UserSummary> authors = users.findAll(all.stream().map(Comment::getAuthorId).distinct().toList());

        Map<UUID, List<CommentDto>> repliesByParent = new LinkedHashMap<>();
        List<CommentDto> roots = new ArrayList<>();
        for (Comment comment : all) {
            CommentDto dto = toDto(comment, authors.get(comment.getAuthorId()), List.of());
            if (comment.getParentCommentId() == null) {
                roots.add(dto);
            } else {
                repliesByParent.computeIfAbsent(comment.getParentCommentId(), key -> new ArrayList<>()).add(dto);
            }
        }
        return roots.stream()
                .map(root -> new CommentDto(root.id(), root.postId(), root.parentCommentId(), root.author(),
                        root.body(), root.internal(), root.createdAt(), root.editedAt(),
                        repliesByParent.getOrDefault(root.id(), List.of())))
                .toList();
    }

    private static CommentDto toDto(Comment comment, UserSummary author, List<CommentDto> replies) {
        return new CommentDto(comment.getId(), comment.getPostId(), comment.getParentCommentId(), author,
                comment.getBody(), comment.isInternal(), comment.getCreatedAt(), comment.getEditedAt(), replies);
    }
}
