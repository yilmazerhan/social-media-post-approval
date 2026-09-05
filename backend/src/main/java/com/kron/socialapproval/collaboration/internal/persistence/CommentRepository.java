package com.kron.socialapproval.collaboration.internal.persistence;

import com.kron.socialapproval.collaboration.internal.domain.Comment;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CommentRepository extends JpaRepository<Comment, UUID> {

    @Query("""
           SELECT c FROM Comment c
            WHERE c.postId = :postId AND c.deletedAt IS NULL
            ORDER BY c.createdAt ASC
           """)
    List<Comment> findActiveByPost(@Param("postId") UUID postId);
}
