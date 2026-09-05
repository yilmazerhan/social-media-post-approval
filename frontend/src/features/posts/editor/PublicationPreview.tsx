import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import DesktopWindowsOutlinedIcon from '@mui/icons-material/DesktopWindowsOutlined';
import SmartphoneOutlinedIcon from '@mui/icons-material/SmartphoneOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import type { Attachment, Channel, UserSummary } from '@shared/api/types';
import { PostBody } from '@shared/components/PostBody';
import { formatDuration } from '@shared/lib/format';

/**
 * How the post will read once it is out.
 *
 * <p>It is a neutral publication preview rather than an imitation of a specific social network: the
 * channel decides the width and the character budget, and pretending to be someone else's product
 * would only mislead about what actually gets published.
 *
 * <p>The body is server-sanitised HTML — that is what makes rendering it here safe, and it is the
 * only place in the application that renders HTML it did not build itself.
 */
export function PublicationPreview({
  title,
  bodyHtml,
  attachments,
  channel,
  author,
  dense = false,
}: {
  title: string;
  bodyHtml: string;
  attachments: Attachment[];
  channel: Channel | null;
  author?: UserSummary | null | undefined;
  dense?: boolean | undefined;
}) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const images = attachments.filter((item) => item.kind === 'IMAGE' && item.status === 'READY');
  const videos = attachments.filter((item) => item.kind === 'VIDEO');

  return (
    <Stack spacing={1.5} sx={{ height: '100%' }}>
      <Stack
        sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}
        direction="row"
        useFlexGap
      >
        <Stack sx={{ alignItems: 'center' }} direction="row" spacing={1}>
          {/* On the review screen the surrounding card already says "Content preview"; repeating it
              here would be two headings for one thing. */}
          {!dense && (
            <Typography sx={{ fontWeight: 700 }} variant="subtitle2">
              Live preview
            </Typography>
          )}
          <Chip
            size="small"
            variant="outlined"
            icon={<VisibilityOutlinedIcon />}
            label="Preview only"
            aria-label="This is a preview only; nothing is published from here"
          />
        </Stack>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={device}
          onChange={(_, next) => next && setDevice(next)}
          aria-label="Preview width"
        >
          <ToggleButton value="desktop" aria-label="Desktop preview">
            <DesktopWindowsOutlinedIcon fontSize="small" />
          </ToggleButton>
          <ToggleButton value="mobile" aria-label="Mobile preview">
            <SmartphoneOutlinedIcon fontSize="small" />
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      <Box sx={{ display: 'flex', justifyContent: 'center', flexGrow: 1 }}>
        <Paper
          variant="outlined"
          sx={{
            width: device === 'mobile' ? 390 : '100%',
            maxWidth: '100%',
            p: device === 'mobile' ? 2 : 3,
            transition: 'width 160ms ease',
          }}
        >
          <Stack spacing={1.5}>
            {channel && (
              <Typography variant="overline" color="text.secondary">
                {channel.name}
              </Typography>
            )}
            <Typography sx={{ fontWeight: 700 }} variant={device === 'mobile' ? 'h6' : 'h5'} component="h2">
              {title || 'Untitled post'}
            </Typography>
            {author && (
              <Typography variant="caption" color="text.secondary">
                {author.displayName}
                {author.department ? ` · ${author.department}` : ''}
              </Typography>
            )}

            {bodyHtml ? (
              <PostBody html={bodyHtml} sx={{ fontSize: device === 'mobile' ? 15 : 16, lineHeight: 1.7 }} />
            ) : (
              <Typography variant="body2" color="text.disabled">
                Your content will appear here as you write.
              </Typography>
            )}

            {images.length > 0 && (
              <Box
                sx={{
                  display: 'grid',
                  gap: 1,
                  gridTemplateColumns: images.length > 1 ? '1fr 1fr' : '1fr',
                }}
              >
                {images.map((image) => (
                  <Box
                    key={image.id}
                    component="img"
                    src={image.contentUrl}
                    alt={image.altText ?? ''}
                    sx={{ width: '100%', borderRadius: 1, display: 'block' }}
                  />
                ))}
              </Box>
            )}

            {videos.map((video) => (
              <VideoBlock key={video.id} video={video} />
            ))}

            {attachments.some((item) => item.status !== 'READY') && (
              <Alert severity="info">
                Some media is still being processed and is not shown in the preview yet.
              </Alert>
            )}
          </Stack>
        </Paper>
      </Box>
    </Stack>
  );
}

/**
 * A video, or an honest explanation of why it cannot be played.
 *
 * <p>A player stuck at 0:00 tells a reviewer nothing. When the file cannot be fetched — a retention
 * purge, a failed upload, a record without stored bytes — the card says so and still shows the
 * metadata the decision might rest on.
 */
function VideoBlock({ video }: { video: Attachment }) {
  const [failed, setFailed] = useState(false);

  const caption = [video.filename, video.durationSeconds ? formatDuration(video.durationSeconds) : null]
    .filter(Boolean)
    .join(' · ');

  if (failed) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={0.5}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {video.filename}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {[
              video.durationSeconds ? formatDuration(video.durationSeconds) : null,
              video.width && video.height ? `${video.width}×${video.height}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Typography>
          <Alert severity="warning" sx={{ mt: 1 }}>
            {video.statusDetail ?? 'This video could not be loaded.'}
          </Alert>
        </Stack>
      </Paper>
    );
  }

  return (
    <Box>
      <Box
        component="video"
        controls
        preload="metadata"
        src={video.contentUrl}
        onError={() => setFailed(true)}
        aria-label={video.altText ?? video.filename}
        sx={{ width: '100%', borderRadius: 1, bgcolor: 'common.black', display: 'block' }}
      />
      <Typography variant="caption" color="text.secondary">
        {caption}
      </Typography>
    </Box>
  );
}
