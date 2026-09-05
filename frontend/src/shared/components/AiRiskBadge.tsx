import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutlined';
import type { AiRiskLevel } from '@shared/api/types';

/**
 * Overall risk from the advisory content check.
 *
 * <p>Restrained on purpose: this is an opinion offered to a reviewer, not a verdict. "Not analysed"
 * is a first-class value, because a check that did not run must never look like a clean result.
 */
const LEVELS: Record<AiRiskLevel, { label: string; color: 'success' | 'warning' | 'error' }> = {
  LOW: { label: 'Low risk', color: 'success' },
  MEDIUM: { label: 'Medium risk', color: 'warning' },
  HIGH: { label: 'High risk', color: 'error' },
  CRITICAL: { label: 'Critical risk', color: 'error' },
};

export function AiRiskBadge({
  level,
  status,
  size = 'small',
}: {
  level: AiRiskLevel | null | undefined;
  status?: string | undefined;
  size?: 'small' | 'medium' | undefined;
}) {
  if (!level) {
    return (
      <Tooltip title="No AI analysis is recorded for this version. Human review is still required.">
        <Chip
          icon={<HelpOutlineIcon />}
          label={status === 'SKIPPED' || status === 'FAILED' ? 'AI check unavailable' : 'Not analysed'}
          size={size}
          variant="outlined"
          aria-label="AI analysis not available"
        />
      </Tooltip>
    );
  }
  const config = LEVELS[level];
  return (
    <Chip
      icon={config.color === 'success' ? <ShieldOutlinedIcon /> : <ReportProblemOutlinedIcon />}
      label={`AI: ${config.label}`}
      color={config.color}
      variant="outlined"
      size={size}
      aria-label={`AI-assisted analysis: ${config.label}`}
    />
  );
}
