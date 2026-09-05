import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemButton from '@mui/material/ListItemButton';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import { useNavigate } from 'react-router-dom';
import { notificationsApi } from '@shared/api/client';
import { formatRelative } from '@shared/lib/format';
import { EmptyState } from '@shared/components/EmptyState';

/** The notification centre. Every entry links to the thing it is about. */
export function NotificationBell() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const unread = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: notificationsApi.unreadCount,
    refetchInterval: 60_000,
  });
  const list = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: notificationsApi.list,
    enabled: Boolean(anchor),
  });
  const markAllRead = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const count = unread.data?.count ?? 0;

  return (
    <>
      <Tooltip title="Notifications">
        <IconButton
          onClick={(event) => setAnchor(event.currentTarget)}
          aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
        >
          <Badge badgeContent={count} color="primary">
            <NotificationsNoneIcon />
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 380, maxHeight: 480 } } }}
      >
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5 }}>
          <Typography variant="subtitle2">Notifications</Typography>
          {count > 0 && (
            <Button size="small" onClick={() => markAllRead.mutate()}>
              Mark all read
            </Button>
          )}
        </Stack>
        <Divider />
        {(list.data ?? []).length === 0 ? (
          <EmptyState title="Nothing new" description="You are up to date." />
        ) : (
          <Box>
            {(list.data ?? []).map((item) => (
              <ListItemButton
                key={item.id}
                onClick={() => {
                  setAnchor(null);
                  if (item.entityType === 'POST' && item.entityId) navigate(`/posts/${item.entityId}/edit`);
                }}
                sx={{ alignItems: 'flex-start', bgcolor: item.read ? undefined : 'action.hover' }}
              >
                <Stack spacing={0.25}>
                  <Typography sx={{ fontWeight: item.read ? 400 : 600 }} variant="body2">
                    {item.title}
                  </Typography>
                  {item.body && (
                    <Typography variant="caption" color="text.secondary">
                      {item.body}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.disabled">
                    {formatRelative(item.createdAt)}
                  </Typography>
                </Stack>
              </ListItemButton>
            ))}
          </Box>
        )}
      </Popover>
    </>
  );
}
