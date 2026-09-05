import Chip from '@mui/material/Chip';
import KeyboardDoubleArrowUpIcon from '@mui/icons-material/KeyboardDoubleArrowUp';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import RemoveIcon from '@mui/icons-material/Remove';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import type { Priority } from '@shared/api/types';
import type { ReactElement } from 'react';

const PRIORITY: Record<
  Priority,
  { label: string; color: 'default' | 'info' | 'warning' | 'error'; icon: ReactElement }
> = {
  LOW: { label: 'Low priority', color: 'default', icon: <KeyboardArrowDownIcon /> },
  NORMAL: { label: 'Normal priority', color: 'default', icon: <RemoveIcon /> },
  HIGH: { label: 'High priority', color: 'warning', icon: <KeyboardArrowUpIcon /> },
  URGENT: { label: 'Urgent', color: 'error', icon: <KeyboardDoubleArrowUpIcon /> },
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const config = PRIORITY[priority] ?? PRIORITY.NORMAL;
  return (
    <Chip
      icon={config.icon}
      label={config.label}
      color={config.color}
      size="small"
      variant="outlined"
      aria-label={config.label}
    />
  );
}
