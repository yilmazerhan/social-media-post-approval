import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import ReplayIcon from '@mui/icons-material/Replay';
import BlockIcon from '@mui/icons-material/Block';
import type { ApprovalReview } from '@shared/api/types';
import type { DecisionKind } from '@features/approvals/review/DecisionPanel';
import { AiRiskBadge } from '@shared/components/AiRiskBadge';
import { SlaIndicator } from '@shared/components/SlaIndicator';

/**
 * The decision, always within reach.
 *
 * <p>Long content is the norm here, and a reviewer should never have to scroll back to the top or
 * the bottom to act. The bar also carries the three facts they would otherwise scroll to check:
 * which version, how long is left, and what the content check said.
 */
export function StickyDecisionBar({
  review,
  submitting,
  onSelect,
}: {
  review: ApprovalReview;
  submitting: boolean;
  onSelect: (kind: DecisionKind) => void;
}) {
  return (
    <Paper
      elevation={8}
      square
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1100,
        borderTop: 1,
        borderColor: 'divider',
        px: 2,
        py: 1.5,
      }}
    >
      <Stack spacing={1}>
        <Stack sx={{ alignItems: 'center', flexWrap: 'wrap' }} direction="row" spacing={1} useFlexGap>
          <Typography sx={{ fontWeight: 700 }} variant="caption">
            Version {review.approval.versionNo}
          </Typography>
          <SlaIndicator
            secondsRemaining={review.approval.secondsRemaining}
            dueAt={review.approval.dueAt}
            state={review.approval.slaState}
            variant="compact"
          />
          <AiRiskBadge level={review.aiReview?.riskLevel} status={review.aiReview?.status} />
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button
            fullWidth
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
            variant="outlined"
            startIcon={<ReplayIcon />}
            disabled={submitting}
            onClick={() => onSelect('REQUEST_CHANGES')}
          >
            Changes
          </Button>
          <Box>
            <Button
              color="error"
              startIcon={<BlockIcon />}
              disabled={submitting}
              onClick={() => onSelect('REJECT')}
            >
              Reject
            </Button>
          </Box>
        </Stack>
      </Stack>
    </Paper>
  );
}
