package com.kron.socialapproval.ai.api;

import java.util.List;

/**
 * The port every AI backend implements.
 *
 * <p>A provider is given text and returns findings. It is given no tools, no access to application
 * state and no way to cause a transition, so the worst outcome of a prompt injection hidden inside
 * a post is a misleading note next to a human decision (ARCHITECTURE.md section 11.5).
 */
public interface ContentReviewProvider {

    String id();

    boolean isAvailable();

    Result review(Request request);

    record Request(String title, String bodyText, String channelCode, String locale) {
    }

    record Result(
            String model,
            String riskLevel,
            Integer riskScore,
            String summary,
            List<Finding> findings,
            Integer latencyMs,
            String error) {

        public static Result unavailable(String reason) {
            return new Result(null, null, null, null, List.of(), null, reason);
        }
    }

    record Finding(
            String category,
            String severity,
            String title,
            String excerpt,
            String explanation,
            String suggestion) {
    }
}
