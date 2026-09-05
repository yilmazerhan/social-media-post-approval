import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import { approvalsApi } from '@shared/api/client';
import { ApiError } from '@shared/api/http';
import type { ApprovalReview } from '@shared/api/types';
import { StatusBadge } from '@shared/components/StatusBadge';
import { PriorityBadge } from '@shared/components/PriorityBadge';
import { VersionBadge } from '@shared/components/VersionBadge';
import { SlaIndicator } from '@shared/components/SlaIndicator';
import { UserChip } from '@shared/components/UserChip';
import { formatDateTime } from '@shared/lib/format';
import { PublicationPreview } from '@features/posts/editor/PublicationPreview';
import { DecisionContextBar } from '@features/approvals/review/DecisionContextBar';
import { AiReviewPanel } from '@features/approvals/review/AiReviewPanel';
import { ApprovalTimeline } from '@features/approvals/review/ApprovalTimeline';
import { CommentThread } from '@features/approvals/review/CommentThread';
import { DecisionDialog, DecisionPanel, type DecisionKind } from '@features/approvals/review/DecisionPanel';
import { VersionComparisonDialog } from '@features/approvals/review/VersionComparison';
import { DecisionOutcome } from '@features/approvals/review/DecisionOutcome';
import { StickyDecisionBar } from '@features/approvals/review/StickyDecisionBar';
import { KeyboardShortcutsHelp, useReviewShortcuts } from '@features/approvals/review/KeyboardShortcuts';

const REFRESH_INTERVAL_MS = 30_000;

/**
 * The reviewer's screen.
 *
 * <p>Built around one question: can this person decide, confidently, without leaving the page. The
 * content, the context, the findings, the history and the discussion are all here, and the decision
 * controls stay reachable however long the post is.
 */
export function ApprovalReviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const isWide = useMediaQuery(theme.breakpoints.up('lg'));

  const [decisionKind, setDecisionKind] = useState<DecisionKind | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [outcome, setOutcome] = useState<{ kind: DecisionKind; review: ApprovalReview } | null>(null);
  const [staleNotice, setStaleNotice] = useState(false);
  const openedWith = useRef<{ versionNo: number; status: string } | null>(null);

  const review = useQuery({
    queryKey: ['approval', id],
    queryFn: () => approvalsApi.review(id as string),
    enabled: Boolean(id),
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const neighbours = useQuery({
    queryKey: ['approval-neighbours', id],
    queryFn: () => approvalsApi.neighbours(id as string),
    enabled: Boolean(id),
  });

  // Concurrency: the reviewer's context is never silently replaced. If the post moved while they
  // were reading it, they are told and asked what to do.
  useEffect(() => {
    if (!review.data) return;
    const current = { versionNo: review.data.approval.versionNo, status: review.data.approval.status };
    if (!openedWith.current) {
      openedWith.current = current;
      return;
    }
    if (
      openedWith.current.versionNo !== current.versionNo ||
      (openedWith.current.status === 'PENDING' && current.status !== 'PENDING')
    ) {
      setStaleNotice(true);
    }
  }, [review.data]);

  const decide = useMutation({
    mutationFn: ({ kind, comment }: { kind: DecisionKind; comment: string }) =>
      approvalsApi.decide(id as string, {
        decision: kind,
        comment: comment || undefined,
        // The version the reviewer believes they are judging. The server refuses if it moved.
        expectedVersionNo: review.data?.approval.versionNo ?? 0,
      }),
    onSuccess: (updated, variables) => {
      queryClient.setQueryData(['approval', id], updated);
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      setDecisionKind(null);
      setOutcome({ kind: variables.kind, review: updated });
    },
  });

  const canDecide = review.data?.viewer.canDecide ?? false;
  useReviewShortcuts({
    enabled: canDecide && !decisionKind && !compareOpen && !outcome,
    onApprove: () => setDecisionKind('APPROVE'),
    onRequestChanges: () => setDecisionKind('REQUEST_CHANGES'),
    onReject: () => setDecisionKind('REJECT'),
    onHelp: () => setShortcutsOpen(true),
  });

  const decisionError = useMemo(() => {
    if (!decide.error) return null;
    return decide.error instanceof ApiError
      ? (decide.error.problem.detail ?? 'The decision could not be recorded.')
      : 'The decision could not be recorded.';
  }, [decide.error]);

  if (review.isPending) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <CircularProgress aria-label="Loading review" />
      </Box>
    );
  }

  if (review.isError || !review.data) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Alert severity="error">
          <AlertTitle>This review could not be loaded</AlertTitle>
          It may have been withdrawn, or it may not be assigned to you.
          <Box sx={{ mt: 2 }}>
            <Button onClick={() => navigate('/approvals')}>Back to approvals</Button>
          </Box>
        </Alert>
      </Container>
    );
  }

  const data = review.data;

  if (outcome) {
    return (
      <DecisionOutcome
        kind={outcome.kind}
        review={outcome.review}
        nextApprovalId={neighbours.data?.nextApprovalId ?? null}
        onNext={(nextId) => {
          setOutcome(null);
          openedWith.current = null;
          navigate(`/approvals/${nextId}/review`);
        }}
        onBackToQueue={() => navigate('/approvals')}
      />
    );
  }

  return (
    <>
      <Box sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
        <Container maxWidth="xl" sx={{ py: 2 }}>
          <Stack spacing={1.5}>
            <Stack sx={{ alignItems: 'center', justifyContent: 'space-between' }} direction="row" spacing={1}>
              <Button startIcon={<ArrowBackIcon />} color="inherit" onClick={() => navigate('/approvals')}>
                Back to approvals
              </Button>
              <Stack sx={{ alignItems: 'center' }} direction="row" spacing={0.5}>
                <Tooltip title="Keyboard shortcuts">
                  <IconButton
                    size="small"
                    onClick={() => setShortcutsOpen(true)}
                    aria-label="Keyboard shortcuts"
                  >
                    <KeyboardIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
                <Tooltip title="Previous approval">
                  <span>
                    <IconButton
                      size="small"
                      disabled={!neighbours.data?.previousApprovalId}
                      onClick={() => {
                        openedWith.current = null;
                        navigate(`/approvals/${neighbours.data?.previousApprovalId}/review`);
                      }}
                      aria-label="Previous approval"
                    >
                      <ChevronLeftIcon />
                    </IconButton>
                  </span>
                </Tooltip>
                {neighbours.data && neighbours.data.total > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    {neighbours.data.position} of {neighbours.data.total}
                  </Typography>
                )}
                <Tooltip title="Next approval">
                  <span>
                    <IconButton
                      size="small"
                      disabled={!neighbours.data?.nextApprovalId}
                      onClick={() => {
                        openedWith.current = null;
                        navigate(`/approvals/${neighbours.data?.nextApprovalId}/review`);
                      }}
                      aria-label="Next approval"
                    >
                      <ChevronRightIcon />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
            </Stack>

            <Stack
              sx={{ alignItems: { md: 'flex-start' }, justifyContent: 'space-between' }}
              direction={{ xs: 'column', md: 'row' }}
              spacing={2}
            >
              <Stack spacing={1} sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700 }} variant="h5" component="h1">
                  {data.post.title}
                </Typography>
                <Stack sx={{ flexWrap: 'wrap' }} direction="row" spacing={1} useFlexGap>
                  <StatusBadge status={data.post.status} />
                  <PriorityBadge priority={data.post.priority} />
                  <VersionBadge versionNo={data.approval.versionNo} awaitingApproval size="medium" />
                </Stack>
                {/* The context bar below already carries these on a narrow screen; repeating them
                    in the header would push the content further down for no gain. */}
                <Stack
                  direction="row"
                  spacing={3}
                  useFlexGap
                  sx={{ flexWrap: 'wrap', pt: 0.5, display: { xs: 'none', md: 'flex' } }}
                >
                  <Box>
                    <Typography sx={{ display: 'block' }} variant="overline" color="text.secondary">
                      Creator
                    </Typography>
                    <UserChip user={data.post.author} size="small" />
                  </Box>
                  <Box>
                    <Typography sx={{ display: 'block' }} variant="overline" color="text.secondary">
                      Department
                    </Typography>
                    <Typography variant="body2">{data.post.author.department ?? '—'}</Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ display: 'block' }} variant="overline" color="text.secondary">
                      Submitted
                    </Typography>
                    <Typography variant="body2">{formatDateTime(data.approval.requestedAt)}</Typography>
                  </Box>
                </Stack>
              </Stack>

              <Box sx={{ minWidth: { md: 260 }, display: { xs: 'none', md: 'block' } }}>
                <SlaIndicator
                  secondsRemaining={data.approval.secondsRemaining}
                  dueAt={data.approval.dueAt}
                  state={data.approval.slaState}
                />
              </Box>
            </Stack>
          </Stack>
        </Container>
      </Box>

      <Container maxWidth="xl" sx={{ py: 3, pb: { xs: 14, lg: 6 } }}>
        <Stack spacing={2.5}>
          {staleNotice && (
            <Alert
              severity="warning"
              action={
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    onClick={() => {
                      setStaleNotice(false);
                      openedWith.current = null;
                      review.refetch();
                    }}
                  >
                    Refresh
                  </Button>
                  <Button size="small" variant="outlined" onClick={() => setCompareOpen(true)}>
                    Review changes
                  </Button>
                </Stack>
              }
            >
              <AlertTitle>This post has changed since you opened it</AlertTitle>
              Refresh before deciding — a decision always records the version actually under review.
            </Alert>
          )}

          <DecisionContextBar review={data} />

          <Box
            sx={{
              display: 'grid',
              gap: 2.5,
              alignItems: 'start',
              gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 360px' },
            }}
          >
            <Stack spacing={2.5}>
              <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
                <Stack spacing={2}>
                  <Stack
                    sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}
                    direction="row"
                    useFlexGap
                  >
                    <Typography sx={{ fontWeight: 700 }} variant="h6">
                      Content preview
                    </Typography>
                    {data.availableVersions.length > 1 && (
                      <Button
                        size="small"
                        startIcon={<CompareArrowsIcon />}
                        onClick={() => setCompareOpen(true)}
                      >
                        Compare versions
                      </Button>
                    )}
                  </Stack>
                  <Divider />
                  <PublicationPreview
                    title={data.version.title}
                    bodyHtml={data.version.bodyHtml}
                    attachments={data.version.attachments}
                    channel={data.post.channel}
                    author={data.post.author}
                    dense
                  />
                </Stack>
              </Paper>

              <AiReviewPanel review={data.aiReview} postId={data.post.id} />

              <ApprovalTimeline entries={data.timeline} />

              <CommentThread
                postId={data.post.id}
                comments={data.comments}
                canComment={data.viewer.isAssignedApprover || data.viewer.isAuthor}
              />
            </Stack>

            {isWide && (
              <Box sx={{ position: 'sticky', top: 88 }}>
                <Stack spacing={2.5}>
                  <DecisionPanel review={data} submitting={decide.isPending} onSelect={setDecisionKind} />
                  <Paper variant="outlined" sx={{ p: 2.5 }}>
                    <Stack spacing={1.5}>
                      <Typography sx={{ fontWeight: 700 }} variant="subtitle2">
                        Assigned reviewers
                      </Typography>
                      {data.assignees.map((assignee) => (
                        <UserChip
                          key={assignee.user.id}
                          user={assignee.user}
                          size="small"
                          subtitle={
                            assignee.isMe
                              ? `You · ${assignee.stepStatus.toLowerCase()}`
                              : assignee.stepStatus.toLowerCase()
                          }
                        />
                      ))}
                    </Stack>
                  </Paper>
                </Stack>
              </Box>
            )}
          </Box>
        </Stack>
      </Container>

      {!isWide && data.viewer.canDecide && (
        <StickyDecisionBar review={data} submitting={decide.isPending} onSelect={setDecisionKind} />
      )}

      <DecisionDialog
        kind={decisionKind}
        review={data}
        submitting={decide.isPending}
        error={decisionError}
        onCancel={() => setDecisionKind(null)}
        onConfirm={(comment) => decide.mutate({ kind: decisionKind as DecisionKind, comment })}
      />

      <VersionComparisonDialog
        open={compareOpen}
        postId={data.post.id}
        versions={data.availableVersions}
        currentVersionNo={data.approval.versionNo}
        onClose={() => setCompareOpen(false)}
      />

      <KeyboardShortcutsHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </>
  );
}
