import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import ReplayIcon from '@mui/icons-material/Replay';
import BlockIcon from '@mui/icons-material/Block';
import type { ApprovalReview } from '@shared/api/types';

export type DecisionKind = 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT';

/**
 * Where the reviewer commits.
 *
 * <p>Approve is the primary action, request changes is secondary, and reject is present but never
 * dominant — the visual weight matches how often each is the right answer, and makes the
 * destructive one the hardest to hit by accident.
 */
export function DecisionPanel({
  review,
  submitting,
  onSelect,
}: {
  review: ApprovalReview;
  submitting: boolean;
  onSelect: (kind: DecisionKind) => void;
}) {
  const { viewer, approval } = review;

  if (!viewer.canDecide) {
    return (
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Stack spacing={1.5}>
          <Typography sx={{ fontWeight: 700 }} variant="subtitle1">
            Your decision
          </Typography>
          <Alert severity="info">
            {viewer.isAuthor
              ? 'You wrote this post, so you cannot review it. Separation of duties applies even to reviewers.'
              : viewer.alreadyDecided
                ? 'You have already recorded a decision for this round.'
                : approval.status !== 'PENDING'
                  ? 'This review round is closed.'
                  : 'This review is not assigned to you.'}
          </Alert>
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack spacing={2}>
        <Stack spacing={0.5}>
          <Typography sx={{ fontWeight: 700 }} variant="subtitle1">
            Your decision
          </Typography>
          <Typography variant="caption" color="text.secondary">
            You are deciding on version {approval.versionNo}.
          </Typography>
        </Stack>

        <Button
          fullWidth
          size="large"
          variant="contained"
          color="success"
          startIcon={<CheckCircleOutlineIcon />}
          disabled={submitting}
          onClick={() => onSelect('APPROVE')}
        >
          Approve
        </Button>
        <Button
          fullWidth
          size="large"
          variant="outlined"
          startIcon={<ReplayIcon />}
          disabled={submitting}
          onClick={() => onSelect('REQUEST_CHANGES')}
        >
          Request changes
        </Button>
        <Divider />
        <Button
          fullWidth
          size="small"
          color="error"
          startIcon={<BlockIcon />}
          disabled={submitting}
          onClick={() => onSelect('REJECT')}
        >
          Reject
        </Button>
      </Stack>
    </Paper>
  );
}

/**
 * Confirmation for each decision.
 *
 * <p>Approving restates exactly which version is about to be recorded. Rejecting and requesting
 * changes require the reviewer to say why — an author cannot act on "no".
 */
export function DecisionDialog({
  kind,
  review,
  submitting,
  error,
  onCancel,
  onConfirm,
}: {
  kind: DecisionKind | null;
  review: ApprovalReview;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (comment: string) => void;
}) {
  const [comment, setComment] = useState('');

  if (!kind) return null;

  const commentRequired = kind !== 'APPROVE';
  const canConfirm = !commentRequired || comment.trim().length > 0;

  const config = {
    APPROVE: {
      title: 'Approve this post?',
      confirm: `Approve version ${review.approval.versionNo}`,
      color: 'success' as const,
      commentLabel: 'Add a note (optional)',
      placeholder: 'Anything the author should know…',
    },
    REQUEST_CHANGES: {
      title: 'Request changes',
      confirm: 'Request changes',
      color: 'primary' as const,
      commentLabel: 'Explain what needs to change',
      placeholder: 'Describe the changes required before approval…',
    },
    REJECT: {
      title: 'Reject this post?',
      confirm: 'Reject post',
      color: 'error' as const,
      commentLabel: 'Rejection reason',
      placeholder: 'Explain why this post cannot be published…',
    },
  }[kind];

  return (
    <Dialog
      open
      onClose={submitting ? undefined : onCancel}
      maxWidth="sm"
      fullWidth
      aria-labelledby="decision-dialog-title"
    >
      <DialogTitle id="decision-dialog-title">{config.title}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Stack spacing={1}>
            <Row label="Post" value={review.post.title} />
            <Row label="Version" value={`Version ${review.approval.versionNo}`} />
            <Row label="Creator" value={review.post.author.displayName} />
          </Stack>

          {kind === 'APPROVE' && (
            <Alert severity="info" icon={false}>
              Version {review.approval.versionNo} will be recorded as the approved version.
            </Alert>
          )}
          {kind === 'REJECT' && (
            <Alert severity="warning" icon={false}>
              The author will have to start a new version if they want to publish this content.
            </Alert>
          )}

          <TextField
            multiline
            minRows={3}
            autoFocus
            required={commentRequired}
            label={config.commentLabel}
            placeholder={config.placeholder}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            error={commentRequired && comment.length > 0 && comment.trim().length === 0}
            helperText={commentRequired ? 'The author sees this. It is the only instruction they get.' : ' '}
          />

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color={config.color}
          disabled={!canConfirm || submitting}
          onClick={() => onConfirm(comment.trim())}
        >
          {submitting ? 'Recording…' : config.confirm}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.4 }}>
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 600 }} variant="body2">
        {value}
      </Typography>
    </Box>
  );
}
