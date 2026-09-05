package com.kron.socialapproval.media.internal;

import com.kron.socialapproval.media.api.BlobContent;
import com.kron.socialapproval.media.api.BlobKey;
import com.kron.socialapproval.media.api.BlobStorage;
import com.kron.socialapproval.media.api.UploadTarget;
import com.kron.socialapproval.platform.config.KsaProperties;
import com.kron.socialapproval.platform.error.ApiException;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Filesystem-backed storage for local development, tests and single-node deployments.
 *
 * <p>It does not hand out URLs into the filesystem. The upload target points back at the
 * application's own upload endpoint, so the same three-step browser flow works here as against S3,
 * and authorisation is still the session's job.
 */
@Component
@ConditionalOnProperty(name = "ksa.storage.provider", havingValue = "filesystem", matchIfMissing = true)
public class FilesystemBlobStorage implements BlobStorage {

    private final Path root;
    private final KsaProperties properties;

    public FilesystemBlobStorage(KsaProperties properties) {
        this.properties = properties;
        this.root = Path.of(properties.getStorage().getFilesystemRoot()).toAbsolutePath().normalize();
    }

    @Override
    public String uploadsBucket() {
        return properties.getStorage().getUploadsBucket();
    }

    @Override
    public String mediaBucket() {
        return properties.getStorage().getMediaBucket();
    }

    /**
     * There is no URL that writes into the filesystem from a browser, so the caller is told this is
     * not a direct-to-storage backend and routes the upload through the application instead.
     */
    @Override
    public UploadTarget presignUpload(BlobKey key, String contentType, long maxBytes, Duration ttl) {
        return new UploadTarget(null, "PUT", Map.of("Content-Type", contentType), ttl, false);
    }

    @Override
    public void write(BlobKey key, InputStream data, long sizeBytes) {
        Path target = resolve(key);
        try {
            Files.createDirectories(target.getParent());
            Files.copy(data, target, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "STORAGE_WRITE_FAILED",
                    "The file could not be stored.");
        }
    }

    @Override
    public Optional<BlobContent> read(BlobKey key) {
        Path source = resolve(key);
        if (!Files.isRegularFile(source)) {
            return Optional.empty();
        }
        try {
            String contentType = Optional.ofNullable(Files.probeContentType(source))
                    .orElse("application/octet-stream");
            return Optional.of(new BlobContent(new FileSystemResource(source), contentType, Files.size(source)));
        } catch (IOException e) {
            return Optional.empty();
        }
    }

    @Override
    public void move(BlobKey from, BlobKey to) {
        Path source = resolve(from);
        Path target = resolve(to);
        try {
            if (Files.isRegularFile(source)) {
                Files.createDirectories(target.getParent());
                Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "STORAGE_MOVE_FAILED",
                    "The file could not be moved.");
        }
    }

    @Override
    public void delete(BlobKey key) {
        try {
            Files.deleteIfExists(resolve(key));
        } catch (IOException e) {
            // A blob that cannot be deleted is reported by the reconciliation job, not by failing
            // the user's request.
        }
    }

    /** Resolves inside the storage root and refuses anything that tries to climb out of it. */
    private Path resolve(BlobKey key) {
        Path candidate = root.resolve(key.bucket()).resolve(key.key()).normalize();
        if (!candidate.startsWith(root)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_STORAGE_KEY", "Invalid storage key.");
        }
        return candidate;
    }
}
