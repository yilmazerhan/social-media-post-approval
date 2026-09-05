import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ButtonBase from '@mui/material/ButtonBase';
import { useState } from 'react';
import type { TimelineEntry } from '@shared/api/types';
import { formatDate, formatTime } from '@shared/lib/format';

const ACTION_LABEL: Record<string, string> = {
  SUBMITTED: 'submitted',
  APPROVE: 'approved',
  REJECT: 'rejected',
  REQUEST_CHANGES: 'requested changes to',
};

/**
 * What has happened to this post, in order.
 *
 * <p>Each line is one sentence — who, what, which version, when — and expands to the reviewer's own
 * words where there were any. The history is what turns a status field into an account of a decision.
 */
export function ApprovalTimeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack spacing={2}>
        <Typography sx={{ fontWeight: 700 }} variant="subtitle1">
          Review history
        </Typography>
        <Stack spacing={0}>
          {entries.map((entry, index) => (
            <TimelineRow key={`${entry.at}-${index}`} entry={entry} last={index === entries.length - 1} />
          ))}
        </Stack>
      </Stack>
    </Paper>
  );
}

function TimelineRow({ entry, last }: { entry: TimelineEntry; last: boolean }) {
  const [open, setOpen] = useState(false);
  const hasDetail = Boolean(entry.detail);
  const decision = entry.action !== 'SUBMITTED';

  return (
    <Stack sx={{ alignItems: 'stretch' }} direction="row" spacing={1.5}>
      <Stack sx={{ alignItems: 'center', width: 20, flexShrink: 0 }}>
        <Box
          sx={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            mt: 1,
            bgcolor: decision ? 'primary.main' : 'text.disabled',
            outline: 2,
            outlineColor: 'background.paper',
          }}
        />
        {!last && <Box sx={{ flexGrow: 1, width: 2, bgcolor: 'divider', my: 0.5 }} />}
      </Stack>

      <Box sx={{ pb: last ? 0 : 2, minWidth: 0, flexGrow: 1 }}>
        <ButtonBase
          disabled={!hasDetail}
          onClick={() => setOpen((value) => !value)}
          sx={{ display: 'block', textAlign: 'left', width: '100%', borderRadius: 1, px: 0.5, py: 0.25 }}
          aria-expanded={hasDetail ? open : undefined}
        >
          <Stack sx={{ alignItems: 'baseline', flexWrap: 'wrap' }} direction="row" spacing={1} useFlexGap>
            <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatTime(entry.at)}
            </Typography>
            <Typography variant="body2">
              <strong>{entry.actor?.displayName ?? 'Someone'}</strong>{' '}
              {ACTION_LABEL[entry.action] ?? entry.action}{' '}
              {entry.versionNo ? `version ${entry.versionNo}` : ''}
            </Typography>
            <Typography variant="caption" color="text.disabled">
              {formatDate(entry.at)}
            </Typography>
            {hasDetail && <Chip size="small" variant="outlined" label={open ? 'Hide note' : 'Show note'} />}
          </Stack>
        </ButtonBase>
        {hasDetail && (
          <Collapse in={open}>
            <Paper variant="outlined" sx={{ p: 1.5, mt: 0.75, bgcolor: 'action.hover' }}>
              <Typography variant="body2">“{entry.detail}”</Typography>
            </Paper>
          </Collapse>
        )}
      </Box>
    </Stack>
  );
}
