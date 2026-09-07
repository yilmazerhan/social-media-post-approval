import type { Priority } from "@/generated/prisma/client";
import {
  ChevronDown,
  ChevronsUp,
  ChevronUp,
  Minus,
  type LucideIcon,
} from "lucide-react";
import { Badge, type badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";

/** UI_UX_SPEC.md §2's priority scale. */
const PRIORITY_CONFIG: Record<
  Priority,
  {
    label: string;
    icon: LucideIcon;
    variant: VariantProps<typeof badgeVariants>["variant"];
  }
> = {
  LOW: { label: "Low", icon: ChevronDown, variant: "secondary" },
  NORMAL: { label: "Normal", icon: Minus, variant: "outline" },
  HIGH: { label: "High", icon: ChevronUp, variant: "warning" },
  URGENT: { label: "Urgent", icon: ChevronsUp, variant: "destructive" },
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const { label, icon: Icon, variant } = PRIORITY_CONFIG[priority];
  return (
    <Badge variant={variant}>
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}
