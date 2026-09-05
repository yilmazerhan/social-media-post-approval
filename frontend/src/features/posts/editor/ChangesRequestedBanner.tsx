import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { TimelineEntry } from '@shared/api/types';
import { UserChip } from '@shared/components/UserChip';
import { VersionBadge } from '@shared/components/VersionBadge';
import { formatDateTime } from '@shared/lib/format';

/**
 * The editor changes character when a reviewer has sent the post back.
 *
 * <p>The reviewer's own words come first, because that is the whole instruction. Underneath, the
 * banner makes the consequence explicit: this edit becomes a new version, and the one that was
 * reviewed stays exactly as it was.
 */
export function ChangesRequestedBanner({
  entry,
  nextVersionNo,
}: {
  entry: TimelineEntry;
  nextVersionNo: number;
}) {
  const rejected = entry.action === 'REJECT';

  return (
    <Alert severity={rejected ? 'error' : 'warning'} icon={false} sx={{ borderRadius: 2 }}>
      <AlertTitle sx={{ fontWeight: 700 }}>{rejected ? 'Rejected' : 'Changes requested'}</AlertTitle>
      <Stack spacing={1.5}>
        {entry.detail && (
          <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'background.paper' }}>
            <Typography variant="body2">“{entry.detail}”</Typography>
          </Paper>
        )}
        <Stack
          sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
        >
          <Stack sx={{ alignItems: 'center', flexWrap: 'wrap' }} direction="row" spacing={2} useFlexGap>
            <Box>
              <Typography sx={{ display: 'block' }} variant="overline" color="text.secondary">
                Requested by
              </Typography>
              <UserChip user={entry.actor} size="small" />
            </Box>
            <Box>
              <Typography sx={{ display: 'block' }} variant="overline" color="text.secondary">
                When
              </Typography>
              <Typography variant="body2">{formatDateTime(entry.at)}</Typography>
            </Box>
            <Box>
              <Typography sx={{ display: 'block' }} variant="overline" color="text.secondary">
                On version
              </Typography>
              <Typography variant="body2">Version {entry.versionNo}</Typography>
            </Box>
          </Stack>
          <Stack sx={{ alignItems: { xs: 'flex-start', sm: 'flex-end' } }} spacing={0.5}>
            <VersionBadge versionNo={nextVersionNo} />
            <Typography variant="caption" color="text.secondary">
              Your edits create version {nextVersionNo}. Version {entry.versionNo} stays untouched.
            </Typography>
          </Stack>
        </Stack>
      </Stack>
    </Alert>
  );
}
