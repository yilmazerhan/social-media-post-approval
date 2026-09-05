package com.kron.socialapproval.content.internal.domain;

/**
 * An attachment is only usable once it has been received, sniffed and scanned. A post cannot be
 * submitted while any of its attachments is anything other than {@link #READY}.
 */
public enum AttachmentStatus {
    PENDING,
    UPLOADED,
    SCANNING,
    READY,
    QUARANTINED,
    FAILED
}
