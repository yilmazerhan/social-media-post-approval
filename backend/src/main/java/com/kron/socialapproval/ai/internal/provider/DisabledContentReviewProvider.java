package com.kron.socialapproval.ai.internal.provider;

import com.kron.socialapproval.ai.api.ContentReviewProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * The provider used when AI review is switched off, which is the default until the customer has
 * signed off on the data flow (ARCHITECTURE.md section 11.4).
 *
 * <p>It reports unavailability rather than inventing findings. Every code path above the port is
 * identical whether or not a real provider is configured, and the screens say plainly that no
 * analysis was performed — a governance tool must never imply a check it did not run.
 */
@Component
@ConditionalOnProperty(name = "ksa.ai.provider", havingValue = "noop", matchIfMissing = true)
public class DisabledContentReviewProvider implements ContentReviewProvider {

    @Override
    public String id() {
        return "noop";
    }

    @Override
    public boolean isAvailable() {
        return false;
    }

    @Override
    public Result review(Request request) {
        return Result.unavailable("AI content review is not configured in this environment.");
    }
}
