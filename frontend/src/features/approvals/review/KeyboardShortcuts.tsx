import { useEffect } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

const SHORTCUTS = [
  { keys: 'A', description: 'Approve' },
  { keys: 'R', description: 'Request changes' },
  { keys: 'E', description: 'Reject' },
  { keys: '?', description: 'Show this help' },
];

/**
 * Shortcuts for reviewers working through a queue.
 *
 * <p>They are disabled whenever the cursor is inside a text field or a dialog is open, so typing
 * "a reason for rejection" can never fire an approval.
 */
export function useReviewShortcuts({
  enabled,
  onApprove,
  onRequestChanges,
  onReject,
  onHelp,
}: {
  enabled: boolean;
  onApprove: () => void;
  onRequestChanges: () => void;
  onReject: () => void;
  onHelp: () => void;
}) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true;
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.key.toLowerCase()) {
        case 'a':
          event.preventDefault();
          onApprove();
          break;
        case 'r':
          event.preventDefault();
          onRequestChanges();
          break;
        case 'e':
          event.preventDefault();
          onReject();
          break;
        case '?':
          event.preventDefault();
          onHelp();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, onApprove, onRequestChanges, onReject, onHelp]);
}

export function KeyboardShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="shortcuts-title">
      <DialogTitle id="shortcuts-title">Keyboard shortcuts</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          {SHORTCUTS.map((shortcut) => (
            <Stack sx={{ alignItems: 'center' }} key={shortcut.keys} direction="row" spacing={2}>
              <Box
                component="kbd"
                sx={{
                  minWidth: 28,
                  textAlign: 'center',
                  px: 1,
                  py: 0.25,
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 0.75,
                  fontFamily: 'monospace',
                  fontSize: 13,
                }}
              >
                {shortcut.keys}
              </Box>
              <Typography variant="body2">{shortcut.description}</Typography>
            </Stack>
          ))}
          <Typography variant="caption" color="text.secondary">
            Shortcuts are off while you are typing, and every one of them opens a confirmation first.
          </Typography>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
