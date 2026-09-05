package com.kron.socialapproval.content.internal.persistence;

import com.kron.socialapproval.content.internal.domain.PostVersion;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PostVersionRepository extends JpaRepository<PostVersion, UUID> {

    List<PostVersion> findByPostIdOrderByVersionNoAsc(UUID postId);

    Optional<PostVersion> findByPostIdAndVersionNo(UUID postId, int versionNo);
}
