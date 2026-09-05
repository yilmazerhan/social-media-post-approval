import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import MovieOutlinedIcon from '@mui/icons-material/MovieOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined';
import type { Attachment } from '@shared/api/types';
import { formatBytes, formatDuration } from '@shared/lib/format';

/** An uploading file that has no server record yet. */
export interface PendingUpload {
  clientId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  percent: number;
  error?: string;
}

const KIND_ICON = {
  IMAGE: <ImageOutlinedIcon />,
  VIDEO: <MovieOutlinedIcon />,
  DOCUMENT: <DescriptionOutlinedIcon />,
};

/**
 * One piece of media, with everything a reviewer or author needs to judge it: what it is, how big,
 * what state it is in, and — for images — the alt text that submission requires.
 */
export function MediaCard({
  attachment,
  editable,
  onRemove,
  onPreview,
  onDescribe,
}: {
  attachment: Attachment;
  editable: boolean;
  onRemove?: (() => void) | undefined;
  onPreview?: (() => void) | undefined;
  onDescribe?: ((values: { altText?: string | undefined; caption?: string | undefined }) => void) | undefined;
}) {
  const [altText, setAltText] = useState(attachment.altText ?? '');
  const needsAltText = attachment.kind === 'IMAGE' && !attachment.altText;

  const dimensions =
    attachment.kind === 'VIDEO'
      ? [
          attachment.durationSeconds ? formatDuration(attachment.durationSeconds) : null,
          attachment.width && attachment.height ? `${attachment.width}×${attachment.height}` : null,
        ]
      : [attachment.width && attachment.height ? `${attachment.width} × ${attachment.height} px` : null];

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" spacing={1.5}>
        <Box
          sx={{
            width: 96,
            height: 72,
            flexShrink: 0,
            borderRadius: 1,
            overflow: 'hidden',
            bgcolor: 'action.hover',
            display: 'grid',
            placeItems: 'center',
            color: 'text.secondary',
          }}
        >
          {attachment.kind === 'IMAGE' && attachment.status === 'READY' ? (
            <Box
              component="img"
              src={attachment.contentUrl}
              alt={attachment.altText ?? ''}
              sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            KIND_ICON[attachment.kind]
          )}
        </Box>

        <Stack spacing={0.5} sx={{ flexGrow: 1, minWidth: 0 }}>
          <Stack sx={{ alignItems: 'center', justifyContent: 'space-between' }} direction="row" spacing={1}>
            <Typography sx={{ fontWeight: 600 }} variant="body2" noWrap title={attachment.filename}>
              {attachment.filename}
            </Typography>
            <Stack direction="row" spacing={0.5}>
              {onPreview && (
                <Tooltip title="Preview">
                  <IconButton size="small" onClick={onPreview} aria-label={`Preview ${attachment.filename}`}>
                    <VisibilityOutlinedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              {editable && onRemove && (
                <Tooltip title="Remove">
                  <IconButton size="small" onClick={onRemove} aria-label={`Remove ${attachment.filename}`}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
          </Stack>

          <Stack sx={{ alignItems: 'center', flexWrap: 'wrap' }} direction="row" spacing={1} useFlexGap>
            <Chip size="small" variant="outlined" label={attachment.kind.toLowerCase()} />
            <Typography variant="caption" color="text.secondary">
              {formatBytes(attachment.sizeBytes)}
            </Typography>
            {dimensions.filter(Boolean).map((text) => (
              <Typography key={text} variant="caption" color="text.secondary">
                {text}
              </Typography>
            ))}
            {attachment.status === 'READY' ? (
              <Chip
                size="small"
                icon={<CheckCircleOutlineIcon />}
                label="Ready"
                color="success"
                variant="outlined"
              />
            ) : attachment.status === 'QUARANTINED' || attachment.status === 'FAILED' ? (
              <Chip
                size="small"
                icon={<ErrorOutlineIcon />}
                label={attachment.status.toLowerCase()}
                color="error"
              />
            ) : (
              <Chip size="small" label={attachment.status.toLowerCase()} />
            )}
          </Stack>

          {editable && attachment.kind === 'IMAGE' && (
            <TextField
              size="small"
              fullWidth
              label="Describe this image (required)"
              placeholder="What does the image show?"
              value={altText}
              error={needsAltText}
              helperText={
                needsAltText
                  ? 'Alt text is required before you can submit. It is what a screen reader announces.'
                  : ' '
              }
              onChange={(event) => setAltText(event.target.value)}
              onBlur={() => onDescribe?.({ altText })}
              sx={{ mt: 0.5 }}
            />
          )}
        </Stack>
      </Stack>

      {attachment.statusDetail && attachment.status !== 'READY' && (
        <Alert severity="warning" sx={{ mt: 1 }}>
          {attachment.statusDetail}
        </Alert>
      )}
    </Paper>
  );
}

/** A file still on its way up. Uploading never blocks the rest of the editor. */
export function PendingMediaCard({
  upload,
  onCancel,
}: {
  upload: PendingUpload;
  onCancel?: (() => void) | undefined;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack sx={{ alignItems: 'center' }} direction="row" spacing={1.5}>
        <Box
          sx={{
            width: 96,
            height: 72,
            borderRadius: 1,
            bgcolor: 'action.hover',
            display: 'grid',
            placeItems: 'center',
            color: 'text.secondary',
            flexShrink: 0,
          }}
        >
          {upload.contentType.startsWith('video/') ? <MovieOutlinedIcon /> : <ImageOutlinedIcon />}
        </Box>
        <Stack spacing={0.75} sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600 }} variant="body2" noWrap>
            {upload.filename}
          </Typography>
          {upload.error ? (
            <Alert
              sx={{ fontSize: 'small' }}
              severity="error"
              action={
                onCancel && (
                  <IconButton size="small" onClick={onCancel} aria-label="Dismiss">
                    <DeleteOutlineIcon />
                  </IconButton>
                )
              }
            >
              {upload.error}
            </Alert>
          ) : (
            <>
              <LinearProgress
                variant="determinate"
                value={upload.percent}
                sx={{ height: 6, borderRadius: 3 }}
              />
              <Typography variant="caption" color="text.secondary">
                Uploading… {upload.percent}% · {formatBytes(upload.sizeBytes)}
              </Typography>
            </>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}
