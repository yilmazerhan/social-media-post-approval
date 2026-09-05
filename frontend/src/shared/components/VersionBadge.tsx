import Chip from '@mui/material/Chip';
import HistoryIcon from '@mui/icons-material/History';

/**
 * Which version is on screen. On the review screen this is the single most consequential fact —
 * an approval binds to a version, not to a post — so it is rendered prominently and never abbreviated.
 */
export function VersionBadge({
  versionNo,
  awaitingApproval = false,
  size = 'small',
}: {
  versionNo: number;
  awaitingApproval?: boolean | undefined;
  size?: 'small' | 'medium' | undefined;
}) {
  return (
    <Chip
      icon={<HistoryIcon />}
      label={awaitingApproval ? `Version ${versionNo} awaiting approval` : `Version ${versionNo}`}
      color={awaitingApproval ? 'primary' : 'default'}
      variant={awaitingApproval ? 'filled' : 'outlined'}
      size={size}
      aria-label={awaitingApproval ? `Version ${versionNo}, awaiting approval` : `Version ${versionNo}`}
    />
  );
}
