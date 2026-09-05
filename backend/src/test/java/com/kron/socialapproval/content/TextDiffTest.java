package com.kron.socialapproval.content;

import static org.assertj.core.api.Assertions.assertThat;

import com.kron.socialapproval.content.internal.application.TextDiff;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class TextDiffTest {

    @Test
    @DisplayName("identical text produces no changes")
    void identicalText() {
        List<TextDiff.Segment> segments = TextDiff.diffWords("the same words", "the same words");

        assertThat(segments).allMatch(segment -> segment.type() == TextDiff.Segment.Type.UNCHANGED);
    }

    @Test
    @DisplayName("a removed phrase is reported as removed, not as a rewrite of everything")
    void removedPhrase() {
        List<TextDiff.Segment> segments = TextDiff.diffWords(
                "reports a 40% reduction across their production estate.",
                "reports a 40% reduction.");

        assertThat(segments)
                .filteredOn(segment -> segment.type() == TextDiff.Segment.Type.REMOVED)
                .isNotEmpty();
        assertThat(rebuild(segments, TextDiff.Segment.Type.REMOVED))
                .isEqualTo("reports a 40% reduction across their production estate.");
        assertThat(rebuild(segments, TextDiff.Segment.Type.ADDED)).isEqualTo("reports a 40% reduction.");
    }

    @Test
    @DisplayName("an inserted clause shows as an addition")
    void insertedClause() {
        List<TextDiff.Segment> segments = TextDiff.diffWords(
                "has been running the beta since June and reports",
                "has been running the beta since June and, with permission, reports");

        assertThat(segments)
                .filteredOn(segment -> segment.type() == TextDiff.Segment.Type.ADDED)
                .isNotEmpty();
    }

    /** Reassembles one side of the diff: unchanged text plus the segments of the given type. */
    private static String rebuild(List<TextDiff.Segment> segments, TextDiff.Segment.Type side) {
        StringBuilder builder = new StringBuilder();
        segments.stream()
                .filter(segment -> segment.type() == TextDiff.Segment.Type.UNCHANGED || segment.type() == side)
                .forEach(segment -> builder.append(segment.text()));
        return builder.toString();
    }
}
