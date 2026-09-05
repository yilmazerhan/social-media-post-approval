package com.kron.socialapproval.content.internal.application;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

/**
 * Word-level difference between two versions of a post body.
 *
 * <p>A reviewer comparing version 2 with version 3 needs to see what actually changed, not two
 * paragraphs side by side. This is a plain longest-common-subsequence over words — small enough to
 * read, and correct for the size of text a corporate post contains.
 */
public final class TextDiff {

    /** One run of text, and whether it survived from the old version, was added, or was removed. */
    public record Segment(Type type, String text) {
        public enum Type {
            UNCHANGED,
            ADDED,
            REMOVED
        }
    }

    private TextDiff() {
    }

    public static List<Segment> diffWords(String before, String after) {
        String[] left = tokenize(before);
        String[] right = tokenize(after);

        int[][] lengths = new int[left.length + 1][right.length + 1];
        for (int i = left.length - 1; i >= 0; i--) {
            for (int j = right.length - 1; j >= 0; j--) {
                lengths[i][j] = left[i].equals(right[j])
                        ? lengths[i + 1][j + 1] + 1
                        : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
            }
        }

        List<Segment> segments = new ArrayList<>();
        Deque<String> buffer = new ArrayDeque<>();
        Segment.Type current = null;

        int i = 0;
        int j = 0;
        while (i < left.length && j < right.length) {
            if (left[i].equals(right[j])) {
                current = flushIfChanged(segments, buffer, current, Segment.Type.UNCHANGED);
                buffer.add(left[i]);
                i++;
                j++;
            } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
                current = flushIfChanged(segments, buffer, current, Segment.Type.REMOVED);
                buffer.add(left[i]);
                i++;
            } else {
                current = flushIfChanged(segments, buffer, current, Segment.Type.ADDED);
                buffer.add(right[j]);
                j++;
            }
        }
        while (i < left.length) {
            current = flushIfChanged(segments, buffer, current, Segment.Type.REMOVED);
            buffer.add(left[i++]);
        }
        while (j < right.length) {
            current = flushIfChanged(segments, buffer, current, Segment.Type.ADDED);
            buffer.add(right[j++]);
        }
        flush(segments, buffer, current);
        return segments;
    }

    private static Segment.Type flushIfChanged(List<Segment> segments, Deque<String> buffer,
                                               Segment.Type current, Segment.Type next) {
        if (current != null && current != next) {
            flush(segments, buffer, current);
        }
        return next;
    }

    private static void flush(List<Segment> segments, Deque<String> buffer, Segment.Type type) {
        if (type == null || buffer.isEmpty()) {
            return;
        }
        segments.add(new Segment(type, String.join("", buffer)));
        buffer.clear();
    }

    /** Keeps whitespace attached to its word so the reassembled text reads normally. */
    private static String[] tokenize(String text) {
        if (text == null || text.isEmpty()) {
            return new String[0];
        }
        return text.split("(?<=\\s)");
    }
}
