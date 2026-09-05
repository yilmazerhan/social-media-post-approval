package com.kron.socialapproval.media.api;

import org.springframework.core.io.Resource;

public record BlobContent(Resource resource, String contentType, long sizeBytes) {
}
