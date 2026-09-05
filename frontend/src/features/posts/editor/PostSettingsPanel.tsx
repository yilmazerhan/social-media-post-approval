import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import type { Channel, Priority, UserSummary } from '@shared/api/types';
import { UserChip } from '@shared/components/UserChip';

/**
 * Governance settings for the post: where it is going, how urgent it is, and who will review it.
 *
 * <p>Approver selection is optional. Left empty, the post routes to everyone holding the approver
 * role — the panel says so in words rather than leaving the author to guess.
 */
export function PostSettingsPanel({
  priority,
  channelId,
  channels,
  approvers,
  selectedApprovers,
  disabled,
  onPriorityChange,
  onChannelChange,
  onApproversChange,
}: {
  priority: Priority;
  channelId: string | null;
  channels: Channel[];
  approvers: UserSummary[];
  selectedApprovers: UserSummary[];
  disabled: boolean;
  onPriorityChange: (priority: Priority) => void;
  onChannelChange: (channelId: string | null) => void;
  onApproversChange: (approvers: UserSummary[]) => void;
}) {
  return (
    <Stack spacing={2.5}>
      <Typography sx={{ fontWeight: 700 }} variant="subtitle2">
        Post settings
      </Typography>

      <FormControl size="small" fullWidth disabled={disabled}>
        <InputLabel id="channel-label">Publication channel</InputLabel>
        <Select
          labelId="channel-label"
          label="Publication channel"
          value={channelId ?? ''}
          onChange={(event) => onChannelChange(event.target.value || null)}
        >
          <MenuItem value="">
            <em>Not set</em>
          </MenuItem>
          {channels.map((channel) => (
            <MenuItem key={channel.id} value={channel.id}>
              {channel.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl size="small" fullWidth disabled={disabled}>
        <InputLabel id="priority-label">Priority</InputLabel>
        <Select
          labelId="priority-label"
          label="Priority"
          value={priority}
          onChange={(event) => onPriorityChange(event.target.value as Priority)}
        >
          <MenuItem value="LOW">Low</MenuItem>
          <MenuItem value="NORMAL">Normal</MenuItem>
          <MenuItem value="HIGH">High</MenuItem>
          <MenuItem value="URGENT">Urgent</MenuItem>
        </Select>
      </FormControl>
      <Typography variant="caption" color="text.secondary" sx={{ mt: -1.5 }}>
        Priority sets how long reviewers have: urgent posts get a shorter deadline.
      </Typography>

      <ApprovalRouteCard
        approvers={approvers}
        selected={selectedApprovers}
        disabled={disabled}
        onChange={onApproversChange}
      />
    </Stack>
  );
}

/** Who this post goes to, stated as a sentence rather than as a list of identifiers. */
export function ApprovalRouteCard({
  approvers,
  selected,
  disabled,
  onChange,
}: {
  approvers: UserSummary[];
  selected: UserSummary[];
  disabled: boolean;
  onChange: (approvers: UserSummary[]) => void;
}) {
  const automatic = selected.length === 0;

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Stack sx={{ alignItems: 'center' }} direction="row" spacing={1}>
          <GroupsOutlinedIcon fontSize="small" color="action" />
          <Typography sx={{ fontWeight: 700 }} variant="subtitle2">
            Approval route
          </Typography>
        </Stack>

        <Chip
          size="small"
          variant="outlined"
          color={automatic ? 'default' : 'primary'}
          label={automatic ? 'Automatically assigned' : `${selected.length} reviewer(s) selected`}
          sx={{ alignSelf: 'flex-start' }}
        />

        <Typography variant="body2" color="text.secondary">
          {automatic
            ? approvers.length > 0
              ? `Will be reviewed by ${approvers
                  .slice(0, 2)
                  .map((approver) => approver.department ?? approver.displayName)
                  .join(' and ')}${approvers.length > 2 ? ' and others' : ''}.`
              : 'No approver is configured yet. An administrator needs to assign one.'
            : `Will be reviewed by ${selected.map((approver) => approver.displayName).join(', ')}.`}
        </Typography>

        <Autocomplete
          multiple
          size="small"
          disabled={disabled}
          options={approvers}
          value={selected}
          getOptionLabel={(option) => option.displayName}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          onChange={(_, value) => onChange(value)}
          renderOption={(props, option) => {
            const { key, ...rest } = props as { key: string } & Record<string, unknown>;
            return (
              <Box component="li" key={key} {...rest} sx={{ py: 1 }}>
                <UserChip user={option} size="small" subtitle={option.jobTitle ?? option.department} />
              </Box>
            );
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Choose reviewers (optional)"
              placeholder="Leave empty to route automatically"
            />
          )}
        />
      </Stack>
    </Paper>
  );
}
