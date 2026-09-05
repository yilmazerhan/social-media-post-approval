package com.kron.socialapproval.media.api;

import java.time.Duration;
import java.util.Map;

/**
 * Instructions for the browser to send bytes somewhere.
 *
 * <p>With an S3-compatible backend this is a presigned URL straight to the bucket; with the local
 * filesystem backend it points back at the application. Either way the browser follows the same
 * three steps — ask, PUT, confirm — so the editor does not know or care which is in use.
 */
public record UploadTarget(
        String uploadUrl,
        String method,
        Map<String, String> requiredHeaders,
        Duration expiresIn,
        boolean directToStorage) {
}
