import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ReplayIcon from '@mui/icons-material/Replay';
import BlockIcon from '@mui/icons-material/Block';
import type { ApprovalReview } from '@shared/api/types';
import type { DecisionKind } from '@features/approvals/review/DecisionPanel';
import { formatDateTime } from '@shared/lib/format';

/**
 * What was recorded, and what to do next.
 *
 * <p>A reviewer working a queue wants to move on, so "next approval" is the primary action — but not
 * before the screen has confirmed exactly which version was decided, by whom and when.
 */
export function DecisionOutcome({
  kind,
  review,
  nextApprovalId,
  onNext,
  onBackToQueue,
}: {
  kind: DecisionKind;
  review: ApprovalReview;
  nextApprovalId: string | null;
  onNext: (nextId: string) => void;
  onBackToQueue: () => void;
}) {
  const latest = review.decisions[review.decisions.length - 1];

  const config = {
    APPROVE: { title: 'Post approved', icon: <CheckCircleIcon color="success" sx={{ fontSize: 44 }} /> },
    REQUEST_CHANGES: {
      title: 'Changes requested',
      icon: <ReplayIcon color="warning" sx={{ fontSize: 44 }} />,
    },
    REJECT: { title: 'Post rejected', icon: <BlockIcon color="error" sx={{ fontSize: 44 }} /> },
  }[kind];

  return (
    <Box sx={{ display: 'grid', placeItems: 'center', px: 2, py: 8 }}>
      <Card variant="outlined" sx={{ maxWidth: 560, width: '100%' }}>
        <CardContent sx={{ p: 4 }}>
          <Stack spacing={3}>
            <Stack sx={{ alignItems: 'flex-start' }} spacing={1.5}>
              {config.icon}
              <Typography sx={{ fontWeight: 700 }} variant="h5" component="h1">
                {config.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {kind === 'APPROVE'
                  ? 'The author has been notified. This version is now the approved version.'
                  : 'The author has been notified and can now work on a new version.'}
              </Typography>
            </Stack>

            <Divider />

            <Stack spacing={2}>
              <Field label="Post" value={review.post.title} />
              <Field
                label={kind === 'APPROVE' ? 'Approved version' : 'Version'}
                value={`Version ${review.approval.versionNo}`}
              />
              <Field
                label={kind === 'APPROVE' ? 'Approved by' : 'Decided by'}
                value={latest?.decidedBy?.displayName ?? 'You'}
              />
              <Field
                label={kind === 'APPROVE' ? 'Approved at' : 'Decided at'}
                value={formatDateTime(latest?.decidedAt ?? new Date().toISOString())}
              />
              {latest?.comment && <Field label="Reason" value={latest.comment} />}
            </Stack>

            <Divider />

            <Stack direction="row" spacing={1.5}>
              {nextApprovalId ? (
                <Button variant="contained" onClick={() => onNext(nextApprovalId)}>
                  Next approval
                </Button>
              ) : null}
              <Button onClick={onBackToQueue}>Back to approvals</Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Stack spacing={0.25}>
      <Typography variant="overline" color="text.secondary">
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 600 }} variant="body1">
        {value}
      </Typography>
    </Stack>
  );
}
