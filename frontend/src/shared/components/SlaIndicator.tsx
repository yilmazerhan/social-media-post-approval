import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import AlarmIcon from '@mui/icons-material/Alarm';
import { formatSlaCountdown, formatDateTime } from '@shared/lib/format';

/**
 * How long the reviewer has left, in words.
 *
 * <p>The countdown text carries the meaning; colour and the progress bar only reinforce it. An
 * overdue review says "Overdue by 3h 14m" whether or not the reader can see red.
 */
export function SlaIndicator({
  secondsRemaining,
  dueAt,
  state,
  variant = 'full',
}: {
  secondsRemaining: number;
  dueAt: string;
  state: 'ON_TRACK' | 'WARNING' | 'BREACHED';
  variant?: 'full' | 'compact' | undefined;
}) {
  const { label, overdue } = formatSlaCountdown(secondsRemaining);
  const color = overdue || state === 'BREACHED' ? 'error' : state === 'WARNING' ? 'warning' : 'success';

  if (variant === 'compact') {
    return (
      <Chip
        icon={overdue ? <AlarmIcon /> : <AccessTimeIcon />}
        label={label}
        color={color}
        size="small"
        variant={color === 'success' ? 'outlined' : 'filled'}
        aria-label={`Service level: ${label}`}
      />
    );
  }

  // 24 hours of headroom is the widest bar we draw; beyond that the number is what matters.
  const window = 24 * 3600;
  const progress = Math.max(0, Math.min(100, ((window - secondsRemaining) / window) * 100));

  return (
    <Box aria-label={`Service level: ${label}, due ${formatDateTime(dueAt)}`}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
        {overdue ? <AlarmIcon fontSize="small" color="error" /> : <AccessTimeIcon fontSize="small" />}
        <Typography sx={{ fontWeight: 600 }} variant="body2" color={overdue ? 'error.main' : 'text.primary'}>
          {label}
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={overdue ? 100 : progress}
        color={color}
        sx={{ height: 6, borderRadius: 3 }}
        aria-hidden
      />
      <Typography variant="caption" color="text.secondary">
        Due {formatDateTime(dueAt)}
      </Typography>
    </Box>
  );
}
