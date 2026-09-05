package com.kron.socialapproval.media.api;

/**
 * Where an object lives. Keys are content-addressed under a date and post prefix so a re-upload of
 * identical bytes deduplicates and a listing stays browsable (ARCHITECTURE.md section 7.2).
 */
public record BlobKey(String bucket, String key) {
}
