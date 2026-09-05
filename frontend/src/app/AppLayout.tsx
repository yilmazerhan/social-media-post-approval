import { useState } from 'react';
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { NotificationBell } from '@features/notifications/NotificationBell';
import { useSession } from '@shared/session/SessionContext';

/** The frame every screen sits in. Deliberately quiet: the content is the product. */
export function AppLayout() {
  const { session, logout, can } = useSession();
  const location = useLocation();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const navItems = [
    { to: '/posts', label: 'My posts', show: can('post:read:own') },
    { to: '/approvals', label: 'Approvals', show: can('approval:read:assigned') },
  ].filter((item) => item.show);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex', flexDirection: 'column' }}>
      <AppBar
        position="sticky"
        color="inherit"
        elevation={0}
        sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}
      >
        <Toolbar sx={{ gap: 2 }}>
          <Typography
            component={RouterLink}
            to="/"
            variant="subtitle1"

            sx={{ fontWeight: 700, textDecoration: 'none', color: 'text.primary', whiteSpace: 'nowrap' }}
          >
            Kron Social Approval
          </Typography>

          <Stack direction="row" spacing={0.5} sx={{ flexGrow: 1, display: { xs: 'none', sm: 'flex' } }}>
            {navItems.map((item) => (
              <Button
                key={item.to}
                component={RouterLink}
                to={item.to}
                color={location.pathname.startsWith(item.to) ? 'primary' : 'inherit'}
                sx={{ fontWeight: location.pathname.startsWith(item.to) ? 700 : 500 }}
              >
                {item.label}
              </Button>
            ))}
          </Stack>
          <Box sx={{ flexGrow: 1, display: { sm: 'none' } }} />

          <NotificationBell />

          <IconButton onClick={(event) => setMenuAnchor(event.currentTarget)} aria-label="Account menu">
            <Avatar sx={{ width: 32, height: 32, fontSize: 13 }}>{session?.user.initials}</Avatar>
          </IconButton>
          <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
            <Box sx={{ px: 2, py: 1 }}>
              <Typography variant="subtitle2">{session?.user.displayName}</Typography>
              <Typography variant="caption" color="text.secondary">
                {session?.roles.join(' · ')}
              </Typography>
            </Box>
            <Divider />
            {navItems.map((item) => (
              <MenuItem
                key={item.to}
                component={RouterLink}
                to={item.to}
                onClick={() => setMenuAnchor(null)}
                sx={{ display: { sm: 'none' } }}
              >
                {item.label}
              </MenuItem>
            ))}
            <MenuItem onClick={logout}>Sign out</MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Box component="main" sx={{ flexGrow: 1 }}>
        <Outlet />
      </Box>
    </Box>
  );
}
