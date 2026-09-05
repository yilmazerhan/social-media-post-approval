package com.kron.socialapproval.content.api;

import java.util.UUID;

/**
 * A publication target and its limits. The editor turns {@code maxCharacters} into a live budget and
 * {@code recommendedCharacters} into the point where it starts warning.
 */
public record ChannelDto(
        UUID id,
        String code,
        String name,
        String description,
        Integer maxCharacters,
        Integer recommendedCharacters,
        boolean allowsImage,
        boolean allowsVideo) {
}
