import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useNavigate } from 'react-router-dom';
import type { SubmitResult } from '@shared/api/types';
import { StatusBadge } from '@shared/components/StatusBadge';
import { VersionBadge } from '@shared/components/VersionBadge';
import { formatDateTime, formatSlaCountdown } from '@shared/lib/format';

/**
 * What happens next, spelled out.
 *
 * <p>A toast would tell the author that something worked. This tells them who now has the post, by
 * when it should come back, and what they can do in the meantime — which is the question they
 * actually have.
 */
export function SubmissionConfirmation({ result }: { result: SubmitResult }) {
  const navigate = useNavigate();
  // Reading the clock is a side effect, so the countdown is computed after render rather than
  // during it — the value would otherwise differ between two renders of the same component.
  const [countdown, setCountdown] = useState('');
  useEffect(() => {
    const update = () =>
      setCountdown(
        formatSlaCountdown(Math.round((new Date(result.dueAt).getTime() - Date.now()) / 1000)).label,
      );
    update();
    const handle = window.setInterval(update, 60_000);
    return () => window.clearInterval(handle);
  }, [result.dueAt]);

  return (
    <Box sx={{ display: 'grid', placeItems: 'center', px: 2, py: 8 }}>
      <Card variant="outlined" sx={{ maxWidth: 560, width: '100%' }}>
        <CardContent sx={{ p: 4 }}>
          <Stack spacing={3}>
            <Stack sx={{ alignItems: 'flex-start' }} spacing={1.5}>
              <CheckCircleIcon color="success" sx={{ fontSize: 44 }} />
              <Typography sx={{ fontWeight: 700 }} variant="h5" component="h1">
                Submitted for approval
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Your post is now with its reviewer. You will be notified as soon as there is a decision.
              </Typography>
            </Stack>

            <Divider />

            <Stack spacing={2}>
              <Field label="Post" value={result.postTitle} />
              <Stack sx={{ alignItems: 'center', flexWrap: 'wrap' }} direction="row" spacing={1} useFlexGap>
                <StatusBadge status="IN_REVIEW" />
                <VersionBadge versionNo={result.versionNo} awaitingApproval />
              </Stack>
              <Field
                label="Reviewer"
                value={
                  result.approverNames.length > 0 ? result.approverNames.join(', ') : 'Assigned automatically'
                }
              />
              <Field label="Submitted" value="Just now" />
              <Field label="Expected review" value={`${countdown} · due ${formatDateTime(result.dueAt)}`} />
            </Stack>

            <Divider />

            <Stack direction="row" spacing={1.5}>
              <Button variant="contained" onClick={() => navigate(`/posts/${result.postId}/edit`)}>
                View post
              </Button>
              <Button onClick={() => navigate('/posts')}>Back to my posts</Button>
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
