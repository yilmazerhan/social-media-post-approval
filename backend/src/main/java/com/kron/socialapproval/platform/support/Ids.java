package com.kron.socialapproval.platform.support;

import java.security.SecureRandom;
import java.util.UUID;

/**
 * Time-ordered identifiers (UUIDv7, RFC 9562).
 *
 * <p>Random UUIDv4 keys scatter B-tree inserts across the whole index; a time-ordered key appends,
 * which matters on the tables that grow fastest. They stay non-enumerable, so an id in a URL still
 * reveals nothing about volume or sequence.
 *
 * @see <a href="https://www.rfc-editor.org/rfc/rfc9562.html">RFC 9562</a>
 */
public final class Ids {

    private static final SecureRandom RANDOM = new SecureRandom();

    private Ids() {
    }

    public static UUID newId() {
        byte[] value = new byte[16];
        RANDOM.nextBytes(value);

        long timestamp = System.currentTimeMillis();
        value[0] = (byte) (timestamp >>> 40);
        value[1] = (byte) (timestamp >>> 32);
        value[2] = (byte) (timestamp >>> 24);
        value[3] = (byte) (timestamp >>> 16);
        value[4] = (byte) (timestamp >>> 8);
        value[5] = (byte) timestamp;

        value[6] = (byte) ((value[6] & 0x0F) | 0x70); // version 7
        value[8] = (byte) ((value[8] & 0x3F) | 0x80); // IETF variant

        long high = 0;
        long low = 0;
        for (int i = 0; i < 8; i++) {
            high = (high << 8) | (value[i] & 0xFF);
        }
        for (int i = 8; i < 16; i++) {
            low = (low << 8) | (value[i] & 0xFF);
        }
        return new UUID(high, low);
    }
}
