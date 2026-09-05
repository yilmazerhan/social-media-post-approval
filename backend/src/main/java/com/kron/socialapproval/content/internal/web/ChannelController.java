package com.kron.socialapproval.content.internal.web;

import com.kron.socialapproval.access.api.Permissions;
import com.kron.socialapproval.content.api.ChannelDto;
import com.kron.socialapproval.content.internal.application.PostMapper;
import com.kron.socialapproval.content.internal.persistence.ChannelRepository;
import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/channels")
public class ChannelController {

    private final ChannelRepository channels;
    private final PostMapper mapper;

    public ChannelController(ChannelRepository channels, PostMapper mapper) {
        this.channels = channels;
        this.mapper = mapper;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('" + Permissions.POST_READ_OWN + "')")
    public List<ChannelDto> list() {
        return channels.findByEnabledTrueOrderBySortOrderAsc().stream().map(mapper::toDto).toList();
    }
}
