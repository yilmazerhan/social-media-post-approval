import Avatar from '@mui/material/Avatar';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { UserSummary } from '@shared/api/types';

/** A person, shown as a name and a role context — never as an internal identifier. */
export function UserChip({
  user,
  subtitle,
  size = 'medium',
}: {
  user: UserSummary | null | undefined;
  subtitle?: string | null | undefined;
  size?: 'small' | 'medium' | undefined;
}) {
  if (!user) {
    return (
      <Typography variant="body2" color="text.secondary">
        Unknown user
      </Typography>
    );
  }
  const dimension = size === 'small' ? 24 : 36;
  return (
    <Stack sx={{ alignItems: 'center' }} direction="row" spacing={1.25}>
      <Avatar sx={{ width: dimension, height: dimension, fontSize: size === 'small' ? 11 : 14 }}>
        {user.initials}
      </Avatar>
      <Stack spacing={0} sx={{ minWidth: 0 }}>
        <Typography variant={size === 'small' ? 'body2' : 'subtitle2'} noWrap>
          {user.displayName}
        </Typography>
        {(subtitle ?? user.department) && (
          <Typography variant="caption" color="text.secondary" noWrap>
            {subtitle ?? user.department}
          </Typography>
        )}
      </Stack>
    </Stack>
  );
}
