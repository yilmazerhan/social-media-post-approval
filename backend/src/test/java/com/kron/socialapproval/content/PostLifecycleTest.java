package com.kron.socialapproval.content;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kron.socialapproval.content.internal.domain.Post;
import com.kron.socialapproval.content.internal.domain.PostStatus;
import com.kron.socialapproval.content.internal.domain.Priority;
import com.kron.socialapproval.platform.error.ApiException;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The two rules that make an approval mean something: content is frozen while it is being reviewed,
 * and an edit after a decision starts a new version rather than mutating the reviewed one.
 */
class PostLifecycleTest {

    private static final UUID AUTHOR = UUID.randomUUID();
    private static final Instant NOW = Instant.parse("2026-09-05T09:00:00Z");

    private Post draft() {
        return Post.createDraft(UUID.randomUUID(), "Announcement", AUTHOR, null, NOW);
    }

    @Test
    @DisplayName("a submitted post cannot be edited")
    void contentIsFrozenDuringReview() {
        Post post = draft();
        post.markSubmitted(1, NOW.plusSeconds(3600), AUTHOR, NOW);

        assertThatThrownBy(() -> post.applyEdit("Changed", null, null, null, null, AUTHOR, NOW))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("being reviewed");
    }

    @Test
    @DisplayName("editing a post that came back for changes returns it to draft")
    void editingAfterChangesRequestedStartsANewRound() {
        Post post = draft();
        post.markSubmitted(1, NOW.plusSeconds(3600), AUTHOR, NOW);
        post.markDecided(PostStatus.CHANGES_REQUESTED, UUID.randomUUID(), NOW);

        post.applyEdit("Revised", "<p>Revised</p>", "Revised", Priority.HIGH, null, AUTHOR, NOW);

        assertThat(post.getStatus()).isEqualTo(PostStatus.DRAFT);
        assertThat(post.getPriority()).isEqualTo(Priority.HIGH);
        // The version counter only moves on submission, so version 1 stays exactly as it was.
        assertThat(post.getCurrentVersionNo()).isEqualTo(1);
    }

    @Test
    @DisplayName("an approved post cannot be quietly edited")
    void approvedContentIsNotEditable() {
        Post post = draft();
        post.markSubmitted(1, NOW.plusSeconds(3600), AUTHOR, NOW);
        post.markDecided(PostStatus.APPROVED, UUID.randomUUID(), NOW);

        assertThat(post.getStatus().isEditable()).isFalse();
        assertThatThrownBy(() -> post.applyEdit("Sneaky", null, null, null, null, AUTHOR, NOW))
                .isInstanceOf(ApiException.class);
    }

    @Test
    @DisplayName("a post can only be decided while it is in review")
    void decisionsRequireAnOpenReview() {
        Post post = draft();

        assertThatThrownBy(() -> post.markDecided(PostStatus.APPROVED, UUID.randomUUID(), NOW))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("not awaiting a decision");
    }

    @Test
    @DisplayName("withdrawing returns the post to its author")
    void withdrawReturnsToDraft() {
        Post post = draft();
        post.markSubmitted(1, NOW.plusSeconds(3600), AUTHOR, NOW);

        post.markWithdrawn(AUTHOR, NOW);

        assertThat(post.getStatus()).isEqualTo(PostStatus.DRAFT);
        assertThat(post.getDueAt()).isNull();
    }
}
