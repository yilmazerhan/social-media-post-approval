import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import type { AiFinding, AiReview } from '@shared/api/types';
import { aiApi } from '@shared/api/client';
import { AiRiskBadge } from '@shared/components/AiRiskBadge';

const CATEGORY_LABEL: Record<string, string> = {
  SECURITY: 'Security',
  PRIVACY: 'Privacy',
  COMPLIANCE: 'Compliance',
  BRAND: 'Brand',
  TONE: 'Tone',
  QUALITY: 'Quality',
  ACCESSIBILITY: 'Accessibility',
  CHANNEL_FIT: 'Channel fit',
};

/**
 * The reviewer's view of the content check.
 *
 * <p>Restrained by design: no alarming colour wash, no score dressed up as a verdict, and no
 * "approve with AI" anywhere. A reviewer can acknowledge a finding (I have taken this into account)
 * or dismiss it (this does not apply here), and both are recorded against their name. The decision
 * itself stays entirely theirs.
 */
export function AiReviewPanel({ review, postId }: { review: AiReview | null; postId: string }) {
  const queryClient = useQueryClient();

  const resolve = useMutation({
    mutationFn: ({ findingId, action }: { findingId: string; action: 'acknowledge' | 'dismiss' }) =>
      action === 'acknowledge' ? aiApi.acknowledge(findingId) : aiApi.dismiss(findingId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['approval'] }),
  });

  const unavailable = !review || review.status === 'SKIPPED' || review.status === 'FAILED';

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack spacing={2}>
        <Stack sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }} direction="row" spacing={2}>
          <Stack spacing={0.25}>
            <Stack sx={{ alignItems: 'center' }} direction="row" spacing={1}>
              <AutoAwesomeOutlinedIcon fontSize="small" color="action" />
              <Typography sx={{ fontWeight: 700 }} variant="subtitle1">
                AI review
              </Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              AI-assisted analysis. Human approval required.
            </Typography>
          </Stack>
          <AiRiskBadge level={review?.riskLevel} status={review?.status} size="medium" />
        </Stack>

        {unavailable ? (
          <Alert severity="info">
            {review?.error ?? 'AI analysis is unavailable.'} Human review is still required.
          </Alert>
        ) : (
          <>
            {review?.summary && <Typography variant="body2">{review.summary}</Typography>}

            <Stack spacing={0.75}>
              {(review?.findings ?? []).map((finding) => (
                <FindingAccordion
                  key={finding.id}
                  finding={finding}
                  busy={resolve.isPending}
                  onAcknowledge={() => resolve.mutate({ findingId: finding.id, action: 'acknowledge' })}
                  onDismiss={() => resolve.mutate({ findingId: finding.id, action: 'dismiss' })}
                />
              ))}
            </Stack>

            {review?.model && (
              <Typography variant="caption" color="text.disabled">
                Analysed by {review.provider}
                {review.model !== review.provider ? ` (${review.model})` : ''}
                {review.latencyMs ? ` in ${(review.latencyMs / 1000).toFixed(1)}s` : ''} · post{' '}
                {postId.slice(0, 8)}
              </Typography>
            )}
          </>
        )}
      </Stack>
    </Paper>
  );
}

function FindingAccordion({
  finding,
  busy,
  onAcknowledge,
  onDismiss,
}: {
  finding: AiFinding;
  busy: boolean;
  onAcknowledge: () => void;
  onDismiss: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isNote = finding.severity === 'INFO';

  return (
    <Accordion
      disableGutters
      elevation={0}
      expanded={expanded}
      onChange={(_, value) => setExpanded(value)}
      sx={{
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        opacity: finding.dismissed ? 0.6 : 1,
        '&::before': { display: 'none' },
      }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack
          direction="row"
          spacing={1.25}
          sx={{ alignItems: 'center', pr: 1, minWidth: 0, width: '100%' }}
        >
          {isNote ? (
            <CheckCircleOutlineIcon fontSize="small" color="success" />
          ) : (
            <ReportProblemOutlinedIcon fontSize="small" color="warning" />
          )}
          <Stack sx={{ minWidth: 0, flexGrow: 1 }}>
            <Typography sx={{ fontWeight: isNote ? 400 : 600 }} variant="body2" noWrap>
              {finding.title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {CATEGORY_LABEL[finding.category] ?? finding.category}
            </Typography>
          </Stack>
          {finding.acknowledged && (
            <Chip size="small" color="success" variant="outlined" label="Acknowledged" />
          )}
          {finding.dismissed && <Chip size="small" variant="outlined" label="Dismissed" />}
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={1.5}>
          <Typography variant="body2">{finding.explanation}</Typography>

          {finding.excerpt && (
            <Box sx={{ borderLeft: 3, borderColor: 'divider', pl: 1.5 }}>
              <Typography sx={{ display: 'block' }} variant="caption" color="text.secondary">
                Evidence from the content
              </Typography>
              <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                “{finding.excerpt}”
              </Typography>
            </Box>
          )}

          {finding.suggestion && (
            <Box>
              <Typography sx={{ display: 'block' }} variant="caption" color="text.secondary">
                Suggested wording — AI-generated
              </Typography>
              <Typography variant="body2">{finding.suggestion}</Typography>
            </Box>
          )}

          <Divider />
          <Stack direction="row" spacing={1}>
            <Button size="small" onClick={onAcknowledge} disabled={busy || finding.acknowledged}>
              Acknowledge
            </Button>
            <Button size="small" color="inherit" onClick={onDismiss} disabled={busy || finding.dismissed}>
              Dismiss
            </Button>
          </Stack>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
