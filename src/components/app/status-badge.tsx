import type { PostStatus } from "@/generated/prisma/client";
import {
  Archive,
  Ban,
  CheckCircle2,
  Eye,
  PencilLine,
  Send,
  Undo2,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Badge, type badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";

/** UI_UX_SPEC.md §2's status colour map — colour, icon and label always together, never colour alone. */
const STATUS_CONFIG: Record<
  PostStatus,
  {
    label: string;
    icon: LucideIcon;
    variant: VariantProps<typeof badgeVariants>["variant"];
  }
> = {
  DRAFT: { label: "Draft", icon: PencilLine, variant: "secondary" },
  SUBMITTED: { label: "Submitted", icon: Send, variant: "info" },
  IN_REVIEW: { label: "In review", icon: Eye, variant: "default" },
  CHANGES_REQUESTED: {
    label: "Changes requested",
    icon: Undo2,
    variant: "warning",
  },
  APPROVED: { label: "Approved", icon: CheckCircle2, variant: "success" },
  REJECTED: { label: "Rejected", icon: XCircle, variant: "destructive" },
  CANCELLED: { label: "Cancelled", icon: Ban, variant: "secondary" },
  ARCHIVED: { label: "Archived", icon: Archive, variant: "secondary" },
};

export function StatusBadge({ status }: { status: PostStatus }) {
  const { label, icon: Icon, variant } = STATUS_CONFIG[status];
  return (
    <Badge variant={variant}>
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}
