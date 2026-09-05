package com.kron.socialapproval.workflow.internal.application;

import com.kron.socialapproval.content.api.PostContentQuery;
import com.kron.socialapproval.content.api.PostDetailDto;
import com.kron.socialapproval.content.api.PostLifecycle;
import com.kron.socialapproval.identity.api.UserDirectory;
import com.kron.socialapproval.notification.api.NotificationPublisher;
import com.kron.socialapproval.platform.config.KsaProperties;
import com.kron.socialapproval.platform.error.ApiException;
import com.kron.socialapproval.platform.security.KsaPrincipal;
import com.kron.socialapproval.platform.support.Ids;
import com.kron.socialapproval.workflow.internal.domain.ApprovalMode;
import com.kron.socialapproval.workflow.internal.domain.ApprovalRequest;
import com.kron.socialapproval.workflow.internal.domain.ApprovalStep;
import com.kron.socialapproval.workflow.internal.persistence.ApprovalRequestRepository;
import com.kron.socialapproval.workflow.internal.persistence.ApprovalStepRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Submitting a post for approval.
 *
 * <p>Submission is a workflow act, not a content edit: it freezes a version, opens a review round,
 * resolves the approvers, computes the deadline and tells the people who now owe a decision. All of
 * it commits together, so a post is never "in review" with nobody assigned.
 */
@Service
public class SubmissionService {

    private static final Logger log = LoggerFactory.getLogger(SubmissionService.class);

    private final PostLifecycle postLifecycle;
    private final PostContentQuery content;
    private final ApprovalRequestRepository requests;
    private final ApprovalStepRepository steps;
    private final UserDirectory users;
    private final NotificationPublisher notifications;
    private final KsaProperties properties;
    private final Clock clock;

    public SubmissionService(PostLifecycle postLifecycle, PostContentQuery content,
                             ApprovalRequestRepository requests, ApprovalStepRepository steps,
                             UserDirectory users, NotificationPublisher notifications,
                             KsaProperties properties, Clock clock) {
        this.postLifecycle = postLifecycle;
        this.content = content;
        this.requests = requests;
        this.steps = steps;
        this.users = users;
        this.notifications = notifications;
        this.properties = properties;
        this.clock = clock;
    }

    public record SubmitCommand(List<UUID> approverIds, String mode, String note, Instant requestedDueAt) {
    }

    public record SubmitResult(
            UUID approvalId,
            UUID postId,
            String postTitle,
            int versionNo,
            Instant dueAt,
            List<String> approverNames) {
    }

    @Transactional
    public SubmitResult submit(UUID postId, SubmitCommand command, KsaPrincipal actor) {
        PostDetailDto post = content.detail(postId);
        if (!post.author().id().equals(actor.userId()) && !actor.hasPermission("post:update:any")) {
            throw new ApiException(HttpStatus.NOT_FOUND, "POST_NOT_FOUND", "No such post.");
        }
        if (requests.findOpenByPost(postId).isPresent()) {
            throw new ApiException(HttpStatus.CONFLICT, "APPROVAL_ALREADY_OPEN",
                    "This post is already awaiting a decision.");
        }

        Set<UUID> approvers = resolveApprovers(command.approverIds(), actor);
        Instant now = clock.instant();
        Instant dueAt = resolveDueAt(command.requestedDueAt(), post.priority(), now);

        // Freezes the content as a new immutable version and moves the post into review.
        PostLifecycle.SubmissionSnapshot snapshot = postLifecycle.submitForReview(postId, actor.userId(), dueAt);

        ApprovalMode mode = command.mode() == null ? defaultMode() : ApprovalMode.valueOf(command.mode());
        ApprovalRequest request = ApprovalRequest.open(Ids.newId(), postId, snapshot.postVersionId(), mode,
                mode == ApprovalMode.ALL ? approvers.size() : 1, actor.userId(), now, dueAt);
        requests.save(request);

        int stepNo = 1;
        for (UUID approverId : approvers) {
            ApprovalStep step = ApprovalStep.assign(Ids.newId(), request.getId(), stepNo++, approverId,
                    actor.userId(), now);
            step.markNotified(now);
            steps.save(step);

            notifications.notify(approverId, "APPROVAL_ASSIGNED",
                    "Review requested: " + snapshot.title(),
                    actor.displayName() + " submitted version " + snapshot.versionNo() + " for your approval.",
                    "POST", postId, priorityOf(post.priority()));
        }

        log.info("Post {} submitted as version {} to {} approver(s)", postId, snapshot.versionNo(), approvers.size());
        return new SubmitResult(request.getId(), postId, snapshot.title(), snapshot.versionNo(), dueAt,
                approvers.stream().map(id -> users.require(id).displayName()).toList());
    }

    @Transactional
    public void withdraw(UUID postId, KsaPrincipal actor) {
        PostDetailDto post = content.detail(postId);
        if (!post.author().id().equals(actor.userId()) && !actor.hasPermission("post:update:any")) {
            throw new ApiException(HttpStatus.NOT_FOUND, "POST_NOT_FOUND", "No such post.");
        }
        ApprovalRequest request = requests.findOpenByPost(postId).orElseThrow(() ->
                new ApiException(HttpStatus.CONFLICT, "NO_OPEN_APPROVAL", "This post is not awaiting a decision."));

        Instant now = clock.instant();
        request.cancel(now);
        steps.findByApprovalRequestIdOrderByStepNoAsc(request.getId()).forEach(ApprovalStep::skip);
        postLifecycle.withdrawFromReview(postId, actor.userId());

        steps.findByApprovalRequestIdOrderByStepNoAsc(request.getId()).forEach(step ->
                notifications.notify(step.getAssigneeId(), "APPROVAL_WITHDRAWN",
                        "Review cancelled: " + post.title(),
                        actor.displayName() + " withdrew this post from review.", "POST", postId, "NORMAL"));
    }

    /**
     * Explicit selection, falling back to everyone who holds the approver role. Routing strategies
     * such as the author's manager chain plug in here without changing anything above.
     */
    private Set<UUID> resolveApprovers(List<UUID> requested, KsaPrincipal actor) {
        Set<UUID> resolved = new LinkedHashSet<>();
        if (requested != null) {
            resolved.addAll(requested);
        }
        if (resolved.isEmpty()) {
            users.approvers().forEach(approver -> resolved.add(approver.id()));
        }
        // Separation of duties: an author may hold the approver role, but never reviews their own post.
        resolved.remove(actor.userId());
        if (resolved.isEmpty()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "NO_APPROVER_AVAILABLE",
                    "No approver other than you is available for this post. Ask an administrator to assign one.");
        }
        return resolved;
    }

    private Instant resolveDueAt(Instant requested, String priority, Instant now) {
        if (requested != null && requested.isAfter(now)) {
            return requested;
        }
        int hours = properties.getWorkflow().getDefaultSlaHours();
        int adjusted = switch (priority) {
            case "URGENT" -> Math.max(2, hours / 6);
            case "HIGH" -> Math.max(4, hours / 3);
            case "LOW" -> hours * 2;
            default -> hours;
        };
        return now.plus(java.time.Duration.ofHours(adjusted));
    }

    private ApprovalMode defaultMode() {
        return ApprovalMode.valueOf(properties.getWorkflow().getDefaultMode());
    }

    private static String priorityOf(String postPriority) {
        return "URGENT".equals(postPriority) || "HIGH".equals(postPriority) ? "HIGH" : "NORMAL";
    }
}
