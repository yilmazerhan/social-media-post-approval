import Chip from '@mui/material/Chip';
import EditNoteIcon from '@mui/icons-material/EditNote';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import ReplayIcon from '@mui/icons-material/Replay';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import PublicIcon from '@mui/icons-material/Public';
import ScheduleIcon from '@mui/icons-material/Schedule';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import type { PostStatus } from '@shared/api/types';
import type { ReactElement } from 'react';

/**
 * A post's state, in words a person would use.
 *
 * <p>Every badge carries an icon as well as a colour: status must be readable to someone who cannot
 * distinguish the colours, and to anyone reading a printout.
 */
const STATUS: Record<
  PostStatus,
  { label: string; color: 'default' | 'info' | 'warning' | 'success' | 'error'; icon: ReactElement }
> = {
  DRAFT: { label: 'Draft', color: 'default', icon: <EditNoteIcon /> },
  IN_REVIEW: { label: 'Waiting for approval', color: 'info', icon: <HourglassTopIcon /> },
  CHANGES_REQUESTED: { label: 'Changes requested', color: 'warning', icon: <ReplayIcon /> },
  APPROVED: { label: 'Approved', color: 'success', icon: <CheckCircleIcon /> },
  REJECTED: { label: 'Rejected', color: 'error', icon: <CancelIcon /> },
  SCHEDULED: { label: 'Scheduled', color: 'info', icon: <ScheduleIcon /> },
  PUBLISHED: { label: 'Published', color: 'success', icon: <PublicIcon /> },
  ARCHIVED: { label: 'Archived', color: 'default', icon: <Inventory2Icon /> },
  EXPIRED: { label: 'Expired', color: 'default', icon: <Inventory2Icon /> },
};

export function StatusBadge({
  status,
  size = 'small',
}: {
  status: PostStatus;
  size?: 'small' | 'medium' | undefined;
}) {
  const config = STATUS[status] ?? STATUS.DRAFT;
  return (
    <Chip
      icon={config.icon}
      label={config.label}
      color={config.color}
      size={size}
      variant={config.color === 'default' ? 'outlined' : 'filled'}
      aria-label={`Status: ${config.label}`}
    />
  );
}

export function statusLabel(status: PostStatus): string {
  return STATUS[status]?.label ?? status;
}
