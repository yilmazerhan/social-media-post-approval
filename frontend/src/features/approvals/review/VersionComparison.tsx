import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import { postsApi } from '@shared/api/client';
import type { DiffSegment } from '@shared/api/types';
import { formatDateTime } from '@shared/lib/format';

/**
 * Side-by-side version comparison.
 *
 * <p>Additions and removals are marked with underline and strike-through as well as colour, so the
 * diff is readable in monochrome and to anyone who cannot separate the two hues.
 */
export function VersionComparisonDialog({
  open,
  postId,
  versions,
  currentVersionNo,
  onClose,
}: {
  open: boolean;
  postId: string;
  versions: number[];
  currentVersionNo: number;
  onClose: () => void;
}) {
  const [fromVersion, setFromVersion] = useState(() => Math.max(1, currentVersionNo - 1));

  const comparison = useQuery({
    queryKey: ['compare', postId, fromVersion, currentVersionNo],
    queryFn: () => postsApi.compare(postId, fromVersion, currentVersionNo),
    enabled: open && fromVersion !== currentVersionNo,
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth aria-labelledby="compare-title">
      <DialogTitle id="compare-title" sx={{ pr: 6 }}>
        {/* DialogTitle is already the heading; the lines inside it must not be headings too. */}
        <Stack spacing={0.5}>
          <Typography sx={{ fontWeight: 700 }} variant="h6" component="div">
            Compare versions
          </Typography>
          <Typography variant="body2" color="text.secondary" component="div">
            Version {currentVersionNo} is the version awaiting approval.
          </Typography>
        </Stack>
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 12, top: 12 }} aria-label="Close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>
          <Stack sx={{ alignItems: 'center', flexWrap: 'wrap' }} direction="row" spacing={2} useFlexGap>
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel id="from-version">Compare with</InputLabel>
              <Select
                labelId="from-version"
                label="Compare with"
                value={fromVersion}
                onChange={(event) => setFromVersion(Number(event.target.value))}
              >
                {versions
                  .filter((version) => version !== currentVersionNo)
                  .map((version) => (
                    <MenuItem key={version} value={version}>
                      Version {version}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
            <Stack direction="row" spacing={1}>
              <Chip
                size="small"
                label="Added"
                sx={{ textDecoration: 'underline' }}
                color="success"
                variant="outlined"
              />
              <Chip
                size="small"
                label="Removed"
                sx={{ textDecoration: 'line-through' }}
                color="error"
                variant="outlined"
              />
            </Stack>
          </Stack>

          {comparison.isPending && fromVersion !== currentVersionNo && (
            <Stack sx={{ alignItems: 'center', py: 4 }}>
              <CircularProgress aria-label="Loading comparison" />
            </Stack>
          )}

          {comparison.isError && (
            <Alert severity="error">
              This version could not be loaded. It may have been purged by a retention policy.
            </Alert>
          )}

          {comparison.data && (
            <>
              {comparison.data.identical && (
                <Alert severity="info">
                  These two versions have identical text. Only media or metadata differ.
                </Alert>
              )}

              <Box
                sx={{
                  display: 'grid',
                  gap: 2,
                  gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                }}
              >
                <VersionColumn
                  heading={`Version ${comparison.data.from.versionNo}`}
                  subheading={`Submitted ${formatDateTime(comparison.data.from.createdAt)}`}
                  body={comparison.data.from.bodyText}
                />
                <VersionColumn
                  heading={`Version ${comparison.data.to.versionNo}`}
                  subheading="Awaiting approval"
                  highlight
                  body={comparison.data.to.bodyText}
                />
              </Box>

              <Divider />

              <Stack spacing={1}>
                <Typography sx={{ fontWeight: 700 }} variant="subtitle2">
                  What changed
                </Typography>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography
                    component="div"
                    variant="body2"
                    sx={{ lineHeight: 1.9, whiteSpace: 'pre-wrap' }}
                  >
                    {comparison.data.bodyDiff.map((segment, index) => (
                      <DiffText key={index} segment={segment} />
                    ))}
                  </Typography>
                </Paper>
              </Stack>

              {comparison.data.mediaChanges.length > 0 && (
                <Stack spacing={1}>
                  <Typography sx={{ fontWeight: 700 }} variant="subtitle2">
                    Media changes
                  </Typography>
                  {comparison.data.mediaChanges.map((change) => (
                    <Stack
                      sx={{ alignItems: 'center' }}
                      key={change.attachment.id}
                      direction="row"
                      spacing={1}
                    >
                      <Chip
                        size="small"
                        label={change.change.toLowerCase()}
                        color={change.change === 'ADDED' ? 'success' : 'error'}
                        variant="outlined"
                      />
                      <Typography variant="body2">{change.attachment.filename}</Typography>
                    </Stack>
                  ))}
                </Stack>
              )}
            </>
          )}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

function VersionColumn({
  heading,
  subheading,
  body,
  highlight = false,
}: {
  heading: string;
  subheading: string;
  body: string;
  highlight?: boolean;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, borderColor: highlight ? 'primary.main' : 'divider', borderWidth: highlight ? 2 : 1 }}
    >
      <Stack spacing={1}>
        <Stack spacing={0.25}>
          <Typography sx={{ fontWeight: 700 }} variant="subtitle2">
            {heading}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {subheading}
          </Typography>
        </Stack>
        <Divider />
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
          {body}
        </Typography>
      </Stack>
    </Paper>
  );
}

function DiffText({ segment }: { segment: DiffSegment }) {
  if (segment.type === 'UNCHANGED') return <span>{segment.text}</span>;
  const added = segment.type === 'ADDED';
  return (
    <Box
      component="span"
      sx={{
        bgcolor: added ? 'success.light' : 'error.light',
        color: added ? 'success.contrastText' : 'error.contrastText',
        textDecoration: added ? 'underline' : 'line-through',
        borderRadius: 0.5,
        px: 0.25,
      }}
    >
      <Box
        component="span"
        sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
      >
        {added ? 'Added: ' : 'Removed: '}
      </Box>
      {segment.text}
    </Box>
  );
}
