import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

/** Empty and error states say what happened and what to do next — never just "no data". */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode | undefined;
  title: string;
  description?: string | undefined;
  action?: ReactNode | undefined;
}) {
  return (
    <Stack spacing={1.5} sx={{ alignItems: 'center', py: 6, px: 3, textAlign: 'center' }}>
      {icon && <Box sx={{ color: 'text.disabled', '& svg': { fontSize: 44 } }}>{icon}</Box>}
      <Typography sx={{ fontWeight: 600 }} variant="subtitle1">
        {title}
      </Typography>
      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 460 }}>
          {description}
        </Typography>
      )}
      {action}
    </Stack>
  );
}
