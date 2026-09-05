import { useState } from 'react';
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

/**
 * The author's content check.
 *
 * <p>Two rules shape this panel. The check runs only when the author asks for it, and a suggestion
 * is never applied on their behalf — "Apply suggestion" copies text into the editor and stops there.
 * The assistant advises; the person writes.
 */
export function AiContentCheckPanel({
  review,
  running,
  onRun,
  onApplySuggestion,
  compact = false,
}: {
  review: AiReview | null | undefined;
  running: boolean;
  onRun: () => void;
  onApplySuggestion?: ((finding: AiFinding) => void) | undefined;
  compact?: boolean | undefined;
}) {
  const findings = review?.findings ?? [];
  const actionable = findings.filter((finding) => finding.severity !== 'INFO' && !finding.dismissed);
  const unavailable = review && (review.status === 'SKIPPED' || review.status === 'FAILED');

  return (
    <Stack spacing={1.5}>
      {/* The panel lives in a narrow column, so the action sits under the title rather than
          wrapping across two lines beside it. */}
      <Stack spacing={1}>
        <Stack sx={{ alignItems: 'center' }} direction="row" spacing={1}>
          <AutoAwesomeOutlinedIcon fontSize="small" color="action" />
          <Typography sx={{ fontWeight: 700 }} variant="subtitle2">
            AI content check
          </Typography>
        </Stack>
        <Button
          size="small"
          variant="outlined"
          onClick={onRun}
          disabled={running}
          sx={{ alignSelf: 'flex-start' }}
        >
          {running ? 'Checking…' : review ? 'Check again' : 'Check content'}
        </Button>
      </Stack>

      <Typography variant="caption" color="text.secondary">
        AI-assisted review. It never changes your content and never decides anything.
      </Typography>

      {unavailable && (
        <Alert severity="info">
          {review?.error ?? 'AI review is temporarily unavailable.'} You can continue if policy allows.
        </Alert>
      )}

      {!review && !running && (
        <Alert sx={{ fontSize: 'inherit' }} severity="info" icon={<AutoAwesomeOutlinedIcon />}>
          Run a check to see privacy, security, brand and tone notes before you submit.
        </Alert>
      )}

      {review?.status === 'COMPLETED' && (
        <>
          <Stack sx={{ alignItems: 'center', flexWrap: 'wrap' }} direction="row" spacing={1} useFlexGap>
            {actionable.length === 0 ? (
              <Chip
                size="small"
                color="success"
                variant="outlined"
                icon={<CheckCircleOutlineIcon />}
                label="Nothing to review"
              />
            ) : (
              <Chip
                size="small"
                color="warning"
                icon={<ReportProblemOutlinedIcon />}
                label={`${actionable.length} item${actionable.length === 1 ? '' : 's'} to review`}
              />
            )}
            {review.riskLevel && (
              <Chip
                size="small"
                variant="outlined"
                label={`Overall: ${review.riskLevel.toLowerCase()} risk`}
              />
            )}
          </Stack>

          {review.summary && (
            <Typography variant="body2" color="text.secondary">
              {review.summary}
            </Typography>
          )}

          <Stack spacing={0.75}>
            {findings.map((finding) => (
              <FindingRow
                key={finding.id}
                finding={finding}
                compact={compact}
                onApplySuggestion={onApplySuggestion}
              />
            ))}
          </Stack>
        </>
      )}
    </Stack>
  );
}

const SEVERITY_LABEL: Record<string, string> = {
  INFO: 'Information',
  WARNING: 'Needs a look',
  CRITICAL: 'Must be resolved',
};

function FindingRow({
  finding,
  compact,
  onApplySuggestion,
}: {
  finding: AiFinding;
  compact: boolean;
  onApplySuggestion?: ((finding: AiFinding) => void) | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const isNote = finding.severity === 'INFO';

  return (
    <Accordion
      disableGutters
      elevation={0}
      expanded={expanded}
      onChange={(_, value) => setExpanded(value)}
      sx={{ border: 1, borderColor: 'divider', borderRadius: 1, '&::before': { display: 'none' } }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 44 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', pr: 1, minWidth: 0 }}>
          {isNote ? (
            <CheckCircleOutlineIcon fontSize="small" color="success" />
          ) : (
            <ReportProblemOutlinedIcon fontSize="small" color="warning" />
          )}
          <Typography variant="body2" sx={{ fontWeight: isNote ? 400 : 600, minWidth: 0 }} noWrap={compact}>
            {finding.title}
          </Typography>
          <Chip size="small" variant="outlined" label={finding.category.toLowerCase()} />
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={1.25}>
          <Typography variant="caption" color="text.secondary">
            {SEVERITY_LABEL[finding.severity] ?? finding.severity} · {finding.category.toLowerCase()}
          </Typography>
          <Typography variant="body2">{finding.explanation}</Typography>

          {finding.excerpt && (
            <Paper variant="outlined" sx={{ p: 1.25, bgcolor: 'action.hover' }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                In your content
              </Typography>
              <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                “{finding.excerpt}”
              </Typography>
            </Paper>
          )}

          {finding.suggestion && (
            <>
              <Divider />
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  Suggested wording — AI-generated, yours to accept or ignore
                </Typography>
                <Typography variant="body2">{finding.suggestion}</Typography>
                {onApplySuggestion && (
                  <Button size="small" sx={{ mt: 1 }} onClick={() => onApplySuggestion(finding)}>
                    Apply suggestion
                  </Button>
                )}
              </Box>
            </>
          )}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
