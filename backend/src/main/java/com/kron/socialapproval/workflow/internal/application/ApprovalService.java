package com.kron.socialapproval.workflow.internal.application;

import com.kron.socialapproval.ai.api.AiReviewDto;
import com.kron.socialapproval.ai.api.AiReviewQuery;
import com.kron.socialapproval.collaboration.api.CommentQuery;
import com.kron.socialapproval.content.api.PostContentQuery;
import com.kron.socialapproval.content.api.PostDetailDto;
import com.kron.socialapproval.content.api.PostLifecycle;
import com.kron.socialapproval.content.api.PostVersionDto;
import com.kron.socialapproval.identity.api.UserDirectory;
import com.kron.socialapproval.identity.api.UserSummary;
import com.kron.socialapproval.notification.api.NotificationPublisher;
import com.kron.socialapproval.platform.config.KsaProperties;
import com.kron.socialapproval.platform.error.ApiException;
import com.kron.socialapproval.platform.security.KsaPrincipal;
import com.kron.socialapproval.platform.support.Ids;
import com.kron.socialapproval.workflow.api.ApprovalDtos;
import com.kron.socialapproval.workflow.internal.domain.ApprovalAction;
import com.kron.socialapproval.workflow.internal.domain.ApprovalMode;
import com.kron.socialapproval.workflow.internal.domain.ApprovalRequest;
import com.kron.socialapproval.workflow.internal.domain.ApprovalStatus;
import com.kron.socialapproval.workflow.internal.domain.ApprovalStep;
import com.kron.socialapproval.workflow.internal.domain.DecisionType;
import com.kron.socialapproval.workflow.internal.domain.StepStatus;
import com.kron.socialapproval.workflow.internal.persistence.ApprovalActionRepository;
import com.kron.socialapproval.workflow.internal.persistence.ApprovalRequestRepository;
import com.kron.socialapproval.workflow.internal.persistence.ApprovalStepRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The approver's side of the workflow: the queue, the review payload, and recording a decision.
 *
 * <p>Decisions are guarded by three checks that exist for the same reason — an approval must bind
 * to exact content: the round must still be open, the reviewer must be assigned to it, and the
 * version they believe they are judging must be the version actually under review.
 */
@Service
public class ApprovalService {

    private static final Logger log = LoggerFactory.getLogger(ApprovalService.class);

    private final ApprovalRequestRepository requests;
    private final ApprovalStepRepository steps;
    private final ApprovalActionRepository actions;
    private final PostContentQuery content;
    private final PostLifecycle postLifecycle;
    private final UserDirectory users;
    private final AiReviewQuery aiReviews;
    private final CommentQuery comments;
    private final NotificationPublisher notifications;
    private final KsaProperties properties;
    private final Clock clock;

    public ApprovalService(ApprovalRequestRepository requests, ApprovalStepRepository steps,
                           ApprovalActionRepository actions, PostContentQuery content,
                           PostLifecycle postLifecycle, UserDirectory users, AiReviewQuery aiReviews,
                           CommentQuery comments, NotificationPublisher notifications,
                           KsaProperties properties, Clock clock) {
        this.requests = requests;
        this.steps = steps;
        this.actions = actions;
        this.content = content;
        this.postLifecycle = postLifecycle;
        this.users = users;
        this.aiReviews = aiReviews;
        this.comments = comments;
        this.notifications = notifications;
        this.properties = properties;
        this.clock = clock;
    }

    public record DecisionCommand(String decision, String comment, Integer expectedVersionNo, String ipAddress) {
    }

    // -------------------------------------------------------------------------------------
    // Queue
    // -------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<ApprovalDtos.ApprovalSummary> queue(KsaPrincipal actor, boolean openOnly) {
        List<ApprovalRequest> found = actor.hasPermission("approval:read:all")
                ? requests.findAllOpen()
                : requests.findAssignedTo(actor.userId());

        List<ApprovalRequest> filtered = openOnly
                ? found.stream().filter(request -> request.getStatus().isOpen()).toList()
                : found;

        Instant now = clock.instant();
        List<UUID> requestIds = filtered.stream().map(ApprovalRequest::getId).toList();
        Map<UUID, List<ApprovalAction>> actionsByRequest = requestIds.isEmpty()
                ? Map.of()
                : actions.findByApprovalRequestIdInOrderByPerformedAtAsc(requestIds).stream()
                .collect(java.util.stream.Collectors.groupingBy(ApprovalAction::getApprovalRequestId));

        return filtered.stream()
                .map(request -> {
                    PostDetailDto post = content.detail(request.getPostId());
                    Optional<AiReviewDto> ai = aiReviews.forVersion(request.getPostVersionId());
                    boolean decidedByMe = actionsByRequest.getOrDefault(request.getId(), List.of()).stream()
                            .filter(ApprovalAction::isDecision)
                            .anyMatch(action -> action.getActorId().equals(actor.userId()));
                    return new ApprovalDtos.ApprovalSummary(
                            request.getId(),
                            post.id(),
                            post.title(),
                            excerpt(post.bodyText()),
                            post.status(),
                            post.priority(),
                            post.channel() == null ? null : post.channel().name(),
                            post.author(),
                            post.versionNo(),
                            post.attachments().size(),
                            request.getRequestedAt(),
                            request.getDueAt(),
                            request.getSlaState().name(),
                            Duration.between(now, request.getDueAt()).getSeconds(),
                            now.isAfter(request.getDueAt()),
                            ai.map(AiReviewDto::riskLevel).orElse(null),
                            ai.map(AiReviewDto::status).orElse("NOT_RUN"),
                            decidedByMe);
                })
                .sorted(Comparator.comparing(ApprovalDtos.ApprovalSummary::dueAt))
                .toList();
    }

    // -------------------------------------------------------------------------------------
    // Review payload
    // -------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public ApprovalDtos.ApprovalReview review(UUID approvalId, KsaPrincipal actor) {
        ApprovalRequest request = requireVisible(approvalId, actor);
        Instant now = clock.instant();

        PostDetailDto post = content.detail(request.getPostId());
        PostVersionDto version = content.version(request.getPostVersionId());
        List<ApprovalStep> requestSteps = steps.findByApprovalRequestIdOrderByStepNoAsc(approvalId);
        List<ApprovalAction> requestDecisions = actions.findByApprovalRequestIdOrderByPerformedAtAsc(approvalId)
                .stream().filter(ApprovalAction::isDecision).toList();

        Map<UUID, UserSummary> people = users.findAll(java.util.stream.Stream.concat(
                        requestSteps.stream().map(ApprovalStep::getAssigneeId),
                        requestDecisions.stream().map(ApprovalAction::getActorId))
                .distinct().toList());

        boolean isAssigned = requestSteps.stream().anyMatch(step -> step.getAssigneeId().equals(actor.userId()));
        boolean alreadyDecided = requestDecisions.stream()
                .anyMatch(action -> action.getActorId().equals(actor.userId()));
        boolean isAuthor = post.author() != null && post.author().id().equals(actor.userId());

        ApprovalDtos.ViewerContext viewer = new ApprovalDtos.ViewerContext(
                request.getStatus().isOpen()
                        && isAssigned
                        && !alreadyDecided
                        && !isAuthor
                        && actor.hasPermission("approval:decide"),
                isAssigned,
                isAuthor,
                alreadyDecided,
                true);

        return new ApprovalDtos.ApprovalReview(
                header(request, now, post.versionNo()),
                post,
                version,
                requestSteps.stream()
                        .map(step -> new ApprovalDtos.Assignee(
                                people.get(step.getAssigneeId()),
                                step.getStatus().name(),
                                step.getAssignedAt(),
                                step.getAssigneeId().equals(actor.userId())))
                        .toList(),
                requestDecisions.stream()
                        .map(action -> new ApprovalDtos.Decision(
                                action.getId(),
                                people.get(action.getActorId()),
                                action.getAction().name(),
                                action.getNote(),
                                post.versionNo(),
                                action.getPerformedAt()))
                        .toList(),
                timelineFor(request.getPostId()),
                aiReviews.forVersion(request.getPostVersionId())
                        .or(() -> aiReviews.latestForPost(request.getPostId()))
                        .orElse(null),
                comments.threadFor(request.getPostId(), actor.hasPermission("approval:decide")),
                viewer,
                content.versions(request.getPostId()).stream().map(PostVersionDto::versionNo).toList());
    }

    /**
     * The review history, assembled from what actually happened: every submitted version and every
     * decision recorded against it.
     */
    @Transactional(readOnly = true)
    public List<ApprovalDtos.TimelineEntry> timelineFor(UUID postId) {
        List<ApprovalDtos.TimelineEntry> entries = new ArrayList<>();

        for (PostVersionDto version : content.versions(postId)) {
            entries.add(new ApprovalDtos.TimelineEntry(
                    version.createdAt(),
                    version.createdBy(),
                    "SUBMITTED",
                    version.versionNo(),
                    "Submitted version " + version.versionNo() + " for approval"));
        }

        List<ApprovalRequest> rounds = requests.findByPostIdOrderByRequestedAtAsc(postId);
        Map<UUID, Integer> versionNoByRequest = new java.util.HashMap<>();
        for (ApprovalRequest round : rounds) {
            versionNoByRequest.put(round.getId(), content.version(round.getPostVersionId()).versionNo());
        }
        List<UUID> roundIds = rounds.stream().map(ApprovalRequest::getId).toList();
        if (!roundIds.isEmpty()) {
            List<ApprovalAction> all = actions.findByApprovalRequestIdInOrderByPerformedAtAsc(roundIds).stream()
                    .filter(ApprovalAction::isDecision)
                    .toList();
            Map<UUID, UserSummary> people = users.findAll(
                    all.stream().map(ApprovalAction::getActorId).distinct().toList());
            for (ApprovalAction action : all) {
                entries.add(new ApprovalDtos.TimelineEntry(
                        action.getPerformedAt(),
                        people.get(action.getActorId()),
                        action.getAction().name(),
                        versionNoByRequest.get(action.getApprovalRequestId()),
                        action.getNote()));
            }
        }

        entries.sort(Comparator.comparing(ApprovalDtos.TimelineEntry::at));
        return entries;
    }

    /** Review, decide, next: the queue order is what "next" means. */
    @Transactional(readOnly = true)
    public ApprovalDtos.Neighbours neighbours(UUID approvalId, KsaPrincipal actor) {
        List<ApprovalDtos.ApprovalSummary> queue = queue(actor, true);
        for (int i = 0; i < queue.size(); i++) {
            if (queue.get(i).approvalId().equals(approvalId)) {
                return new ApprovalDtos.Neighbours(
                        i > 0 ? queue.get(i - 1).approvalId() : null,
                        i < queue.size() - 1 ? queue.get(i + 1).approvalId() : null,
                        i + 1,
                        queue.size());
            }
        }
        return new ApprovalDtos.Neighbours(null, queue.isEmpty() ? null : queue.get(0).approvalId(), 0, queue.size());
    }

    // -------------------------------------------------------------------------------------
    // Decision
    // -------------------------------------------------------------------------------------

    @Transactional
    public ApprovalDtos.ApprovalReview decide(UUID approvalId, DecisionCommand command, KsaPrincipal actor) {
        ApprovalRequest request = requests.findById(approvalId).orElseThrow(ApprovalService::notFound);
        Instant now = clock.instant();

        if (!request.getStatus().isOpen()) {
            throw new ApiException(HttpStatus.CONFLICT, "APPROVAL_ALREADY_DECIDED",
                    "Another reviewer already decided this post. Refresh to see the outcome.");
        }

        ApprovalStep step = steps.findByApprovalRequestIdAndAssigneeId(approvalId, actor.userId())
                .orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "NOT_ASSIGNED_APPROVER",
                        "This review is not assigned to you."));

        PostDetailDto post = content.detail(request.getPostId());
        if (post.author().id().equals(actor.userId())) {
            // Separation of duties, enforced even for someone holding both roles.
            throw new ApiException(HttpStatus.FORBIDDEN, "SELF_APPROVAL_FORBIDDEN",
                    "You cannot decide on a post you wrote.");
        }

        PostVersionDto version = content.version(request.getPostVersionId());
        if (command.expectedVersionNo() != null && command.expectedVersionNo() != version.versionNo()) {
            throw new ApiException(HttpStatus.CONFLICT, "VERSION_MISMATCH",
                    "This post changed since you opened it. Reload before deciding — version "
                            + version.versionNo() + " is the one awaiting approval.");
        }

        DecisionType decision = parse(command.decision());
        String comment = command.comment() == null ? null : command.comment().trim();
        if (decision.requiresComment() && (comment == null || comment.isBlank())) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "DECISION_COMMENT_REQUIRED",
                    decision == DecisionType.REJECT
                            ? "Give a reason for rejecting this post."
                            : "Explain what needs to change before this can be approved.");
        }

        actions.save(ApprovalAction.decision(Ids.newId(), approvalId, step.getId(), version.id(),
                actor.userId(), decision, comment, command.ipAddress(), now));
        step.complete();

        applyOutcome(request, decision, comment, actor, post, version, now);
        return review(approvalId, actor);
    }

    /**
     * A rejection or change request ends the round at once. An approval ends it only when the mode's
     * quorum is satisfied.
     */
    private void applyOutcome(ApprovalRequest request, DecisionType decision, String comment,
                              KsaPrincipal actor, PostDetailDto post, PostVersionDto version, Instant now) {
        if (decision != DecisionType.APPROVE) {
            ApprovalStatus outcome = decision == DecisionType.REJECT
                    ? ApprovalStatus.REJECTED : ApprovalStatus.CHANGES_REQUESTED;
            request.complete(outcome, comment, now);
            steps.findByApprovalRequestIdOrderByStepNoAsc(request.getId()).forEach(ApprovalStep::skip);
            postLifecycle.applyDecision(request.getPostId(),
                    decision == DecisionType.REJECT
                            ? PostLifecycle.DecisionOutcome.REJECTED
                            : PostLifecycle.DecisionOutcome.CHANGES_REQUESTED,
                    actor.userId());
            notifyAuthor(post, actor, decision, comment, version.versionNo());
            return;
        }

        long approvals = actions.findByApprovalRequestIdOrderByPerformedAtAsc(request.getId()).stream()
                .filter(ApprovalAction::isDecision)
                .filter(recorded -> recorded.asDecision() == DecisionType.APPROVE)
                .count();
        boolean satisfied = request.getMode() == ApprovalMode.ALL
                ? approvals >= request.getRequiredApprovals()
                : approvals >= 1;

        if (satisfied) {
            request.complete(ApprovalStatus.APPROVED, comment, now);
            steps.findByApprovalRequestIdOrderByStepNoAsc(request.getId()).stream()
                    .filter(step -> step.getStatus() == StepStatus.PENDING)
                    .forEach(ApprovalStep::skip);
            postLifecycle.applyDecision(request.getPostId(), PostLifecycle.DecisionOutcome.APPROVED, actor.userId());
            notifyAuthor(post, actor, decision, comment, version.versionNo());
        }
        log.info("Approval {} recorded {} by {}", request.getId(), decision, actor.userId());
    }

    private void notifyAuthor(PostDetailDto post, KsaPrincipal actor, DecisionType decision,
                              String comment, int versionNo) {
        String title = switch (decision) {
            case APPROVE -> "Approved: " + post.title();
            case REJECT -> "Rejected: " + post.title();
            case REQUEST_CHANGES -> "Changes requested: " + post.title();
        };
        String body = switch (decision) {
            case APPROVE -> actor.displayName() + " approved version " + versionNo + ".";
            case REJECT -> actor.displayName() + " rejected version " + versionNo + ". " + safe(comment);
            case REQUEST_CHANGES -> actor.displayName() + " asked for changes to version " + versionNo
                    + ". " + safe(comment);
        };
        notifications.notify(post.author().id(), "APPROVAL_DECIDED", title, body, "POST", post.id(),
                decision == DecisionType.APPROVE ? "NORMAL" : "HIGH");
    }

    /** Recomputes SLA state for every open round; used by the scan job and on read. */
    @Transactional
    public int refreshSlaStates() {
        Instant now = clock.instant();
        int threshold = properties.getWorkflow().getSlaWarningThresholdPercent();
        int changed = 0;
        for (ApprovalRequest request : requests.findAllOpen()) {
            if (request.refreshSla(now, threshold)) {
                changed++;
            }
        }
        return changed;
    }

    private ApprovalDtos.ApprovalHeader header(ApprovalRequest request, Instant now, int versionNo) {
        return new ApprovalDtos.ApprovalHeader(
                request.getId(),
                request.getStatus().name(),
                request.getMode().name(),
                request.getRequiredApprovals(),
                users.find(request.getRequestedBy()).orElse(null),
                request.getRequestedAt(),
                request.getDueAt(),
                request.getSlaState().name(),
                Duration.between(now, request.getDueAt()).getSeconds(),
                now.isAfter(request.getDueAt()),
                request.getEscalationLevel(),
                versionNo,
                request.getPostVersionId(),
                request.getOptimisticVersion());
    }

    private ApprovalRequest requireVisible(UUID approvalId, KsaPrincipal actor) {
        ApprovalRequest request = requests.findById(approvalId).orElseThrow(ApprovalService::notFound);
        boolean isAssigned = steps.findByApprovalRequestIdAndAssigneeId(approvalId, actor.userId()).isPresent();
        boolean isAuthor = content.detail(request.getPostId()).author().id().equals(actor.userId());
        if (!isAssigned && !isAuthor && !actor.hasPermission("approval:read:all")) {
            throw notFound();
        }
        return request;
    }

    private static DecisionType parse(String decision) {
        try {
            return DecisionType.valueOf(decision);
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "UNKNOWN_DECISION",
                    "A decision must be APPROVE, REQUEST_CHANGES or REJECT.");
        }
    }

    private static String safe(String comment) {
        return comment == null ? "" : comment;
    }

    private static String excerpt(String text) {
        if (text == null || text.isBlank()) {
            return "";
        }
        String flat = text.replaceAll("\\s+", " ").trim();
        return flat.length() <= 180 ? flat : flat.substring(0, 180).trim() + "…";
    }

    private static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "APPROVAL_NOT_FOUND", "No such approval.");
    }
}
