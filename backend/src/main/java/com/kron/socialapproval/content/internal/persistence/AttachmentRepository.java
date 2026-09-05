package com.kron.socialapproval.content.internal.persistence;

import com.kron.socialapproval.content.internal.domain.Attachment;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AttachmentRepository extends JpaRepository<Attachment, UUID> {

    @Query("""
           SELECT a FROM Attachment a
            WHERE a.postId = :postId AND a.deletedAt IS NULL
            ORDER BY a.sortOrder, a.createdAt
           """)
    List<Attachment> findActiveByPost(@Param("postId") UUID postId);

    @Query("SELECT a FROM Attachment a WHERE a.id = :id AND a.deletedAt IS NULL")
    Optional<Attachment> findActive(@Param("id") UUID id);

    @Query("SELECT COUNT(a) FROM Attachment a WHERE a.postId = :postId AND a.deletedAt IS NULL")
    long countActiveByPost(@Param("postId") UUID postId);
}
