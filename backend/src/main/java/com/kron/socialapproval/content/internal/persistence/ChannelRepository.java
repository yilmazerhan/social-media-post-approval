package com.kron.socialapproval.content.internal.persistence;

import com.kron.socialapproval.content.internal.domain.Channel;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChannelRepository extends JpaRepository<Channel, UUID> {

    List<Channel> findByEnabledTrueOrderBySortOrderAsc();
}
