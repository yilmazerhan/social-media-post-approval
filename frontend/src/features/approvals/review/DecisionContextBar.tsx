import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ApprovalReview } from '@shared/api/types';
import { AiRiskBadge } from '@shared/components/AiRiskBadge';
import { SlaIndicator } from '@shared/components/SlaIndicator';
import { UserChip } from '@shared/components/UserChip';
import { statusLabel } from '@shared/components/StatusBadge';

/**
 * The whole situation in one strip.
 *
 * <p>Six facts, always in the same order, always above the fold: what state this is in, who wrote
 * it, which version is on the table, who owes the decision, how long is left, and what the content
 * check thought. A reviewer should not have to scroll to know where they stand.
 */
export function DecisionContextBar({ review }: { review: ApprovalReview }) {
  const pendingAssignee = review.assignees.find((assignee) => assignee.stepStatus === 'PENDING');

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        divider={<Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', md: 'block' } }} />}
        spacing={{ xs: 2, md: 3 }}
      >
        <Field label="Current status">
          <Typography sx={{ fontWeight: 600 }} variant="body2">
            {statusLabel(review.post.status)}
          </Typography>
        </Field>

        <Field label="Creator">
          <UserChip user={review.post.author} size="small" />
        </Field>

        <Field label="Version">
          <Typography sx={{ fontWeight: 700 }} variant="body2">
            Version {review.approval.versionNo}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            awaiting approval
          </Typography>
        </Field>

        <Field label="Approver">
          {pendingAssignee ? (
            <UserChip
              user={pendingAssignee.user}
              size="small"
              subtitle={pendingAssignee.isMe ? 'You' : (pendingAssignee.user.department ?? undefined)}
            />
          ) : (
            <Typography variant="body2" color="text.secondary">
              No one pending
            </Typography>
          )}
        </Field>

        <Field label="Service level">
          <SlaIndicator
            secondsRemaining={review.approval.secondsRemaining}
            dueAt={review.approval.dueAt}
            state={review.approval.slaState}
            variant="compact"
          />
        </Field>

        <Field label="AI risk">
          <AiRiskBadge level={review.aiReview?.riskLevel} status={review.aiReview?.status} />
        </Field>
      </Stack>
    </Paper>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ minWidth: 0, flex: 1 }}>
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.6 }}>
        {label}
      </Typography>
      {children}
    </Box>
  );
}
