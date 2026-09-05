package com.kron.socialapproval.media.api;

import java.io.InputStream;
import java.time.Duration;
import java.util.Optional;

/**
 * The storage port. Media never goes in the database: large objects would inflate every backup and
 * turn a restore drill into a data migration (ARCHITECTURE.md section 7.1).
 */
public interface BlobStorage {

    /** Name of the bucket that holds unconfirmed uploads. */
    String uploadsBucket();

    /** Name of the bucket that holds confirmed, scanned media. */
    String mediaBucket();

    UploadTarget presignUpload(BlobKey key, String contentType, long maxBytes, Duration ttl);

    /** Used by the local upload endpoint; a direct-to-storage backend never calls it. */
    void write(BlobKey key, InputStream data, long sizeBytes);

    Optional<BlobContent> read(BlobKey key);

    void move(BlobKey from, BlobKey to);

    void delete(BlobKey key);
}
