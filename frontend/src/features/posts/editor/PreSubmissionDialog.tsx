import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined';

export interface SubmissionCheck {
  id: string;
  label: string;
  detail?: string | undefined;
  state: 'PASSED' | 'PENDING' | 'BLOCKED';
}

/**
 * The moment before responsibility moves to someone else.
 *
 * <p>This dialog exists because "Save draft" and "Submit for approval" must never feel like the same
 * gesture. It states what has been checked, what has not, and — plainly — that the content will be
 * frozen once it goes.
 */
export function PreSubmissionDialog({
  open,
  checks,
  approverSummary,
  submitting,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  checks: SubmissionCheck[];
  approverSummary: string;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const blocked = checks.some((check) => check.state === 'BLOCKED');

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth aria-labelledby="pre-submission-title">
      <DialogTitle id="pre-submission-title">Ready to submit?</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <List dense disablePadding>
            {checks.map((check) => (
              <ListItem sx={{ alignItems: 'flex-start' }} key={check.id} disableGutters>
                <ListItemIcon sx={{ minWidth: 36, mt: 0.5 }}>
                  {check.state === 'PASSED' ? (
                    <CheckCircleOutlineIcon fontSize="small" color="success" />
                  ) : check.state === 'BLOCKED' ? (
                    <ErrorOutlineIcon fontSize="small" color="error" />
                  ) : (
                    <RadioButtonUncheckedIcon fontSize="small" color="disabled" />
                  )}
                </ListItemIcon>
                <ListItemText
                  primary={check.label}
                  secondary={check.detail}
                  slotProps={{
                    primary: {
                      variant: 'body2',
                      sx: { fontWeight: check.state === 'BLOCKED' ? 600 : 400 },
                    },
                    secondary: { variant: 'caption' },
                  }}
                />
              </ListItem>
            ))}
          </List>

          <Alert severity="info" icon={false}>
            <Typography variant="body2">
              Once submitted, the content cannot be edited unless the reviewer requests changes.
            </Typography>
          </Alert>

          <Typography variant="body2" color="text.secondary">
            {approverSummary}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onCancel} disabled={submitting}>
          Back to editing
        </Button>
        <Button variant="contained" onClick={onSubmit} disabled={blocked || submitting}>
          {submitting ? 'Submitting…' : 'Submit for approval'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
