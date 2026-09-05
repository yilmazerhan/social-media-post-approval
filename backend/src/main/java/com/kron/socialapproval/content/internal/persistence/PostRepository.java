package com.kron.socialapproval.content.internal.persistence;

import com.kron.socialapproval.content.internal.domain.Post;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PostRepository extends JpaRepository<Post, UUID> {

    @Query("SELECT p FROM Post p WHERE p.id = :id AND p.deletedAt IS NULL")
    Optional<Post> findActive(@Param("id") UUID id);

    @Query("""
           SELECT p FROM Post p
            WHERE p.deletedAt IS NULL
              AND p.authorId = :authorId
            ORDER BY p.updatedAt DESC
           """)
    List<Post> findByAuthor(@Param("authorId") UUID authorId);

    @Query("SELECT p FROM Post p WHERE p.deletedAt IS NULL ORDER BY p.updatedAt DESC")
    List<Post> findAllActive();

    @Query("SELECT p FROM Post p WHERE p.id IN :ids AND p.deletedAt IS NULL")
    List<Post> findAllActiveByIds(@Param("ids") List<UUID> ids);
}
