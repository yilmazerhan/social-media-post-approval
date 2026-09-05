package com.kron.socialapproval.workflow;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kron.socialapproval.platform.error.ApiException;
import com.kron.socialapproval.workflow.internal.domain.ApprovalMode;
import com.kron.socialapproval.workflow.internal.domain.ApprovalRequest;
import com.kron.socialapproval.workflow.internal.domain.ApprovalStatus;
import com.kron.socialapproval.workflow.internal.domain.DecisionType;
import com.kron.socialapproval.workflow.internal.domain.SlaState;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ApprovalRequestTest {

    private static final Instant REQUESTED = Instant.parse("2026-09-05T09:00:00Z");
    private static final Instant DUE = REQUESTED.plus(Duration.ofHours(10));

    private ApprovalRequest open() {
        return ApprovalRequest.open(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                ApprovalMode.ANY_ONE, 1, UUID.randomUUID(), REQUESTED, DUE);
    }

    @Test
    @DisplayName("a round can only be decided once")
    void decidingTwiceIsRefused() {
        ApprovalRequest request = open();
        request.complete(ApprovalStatus.APPROVED, null, REQUESTED.plus(Duration.ofHours(1)));

        assertThatThrownBy(() ->
                request.complete(ApprovalStatus.REJECTED, "changed my mind", REQUESTED.plus(Duration.ofHours(2))))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("already been recorded");
    }

    @Test
    @DisplayName("SLA moves to warning at the configured threshold and to breached after the deadline")
    void slaProgression() {
        ApprovalRequest request = open();

        assertThat(request.refreshSla(REQUESTED.plus(Duration.ofHours(1)), 80)).isFalse();
        assertThat(request.getSlaState()).isEqualTo(SlaState.ON_TRACK);

        assertThat(request.refreshSla(REQUESTED.plus(Duration.ofHours(9)), 80)).isTrue();
        assertThat(request.getSlaState()).isEqualTo(SlaState.WARNING);

        assertThat(request.refreshSla(DUE.plus(Duration.ofMinutes(1)), 80)).isTrue();
        assertThat(request.getSlaState()).isEqualTo(SlaState.BREACHED);
    }

    @Test
    @DisplayName("a closed round no longer tracks its deadline")
    void completedRoundsStopMovingTheirSla() {
        ApprovalRequest request = open();
        request.complete(ApprovalStatus.APPROVED, null, REQUESTED);

        assertThat(request.refreshSla(DUE.plus(Duration.ofHours(5)), 80)).isFalse();
    }

    @Test
    @DisplayName("sending a post back always needs a reason; approving does not")
    void commentRequirement() {
        assertThat(DecisionType.REJECT.requiresComment()).isTrue();
        assertThat(DecisionType.REQUEST_CHANGES.requiresComment()).isTrue();
        assertThat(DecisionType.APPROVE.requiresComment()).isFalse();
    }
}
