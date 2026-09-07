import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A single dashboard stat card — UI_UX_SPEC.md §6. When `href` is given the
 * whole card is a link into the filtered view it summarizes (e.g. the
 * approver's "Pending approvals" card links straight into the queue).
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  href,
  tone = "default",
  className,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  href?: string;
  tone?: "default" | "warning" | "destructive" | "success";
  className?: string;
}) {
  const toneClass = {
    default: "text-foreground",
    warning: "text-warning",
    destructive: "text-destructive",
    success: "text-success",
  }[tone];

  const content = (
    <>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-muted-foreground">{label}</CardTitle>
        <Icon className={cn("size-4", toneClass)} aria-hidden />
      </CardHeader>
      <CardContent>
        <p className={cn("text-2xl font-semibold", toneClass)}>{value}</p>
      </CardContent>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="focus-visible:ring-ring block rounded-xl focus-visible:ring-2 focus-visible:outline-none"
      >
        <Card className={cn("hover:border-ring transition-colors", className)}>
          {content}
        </Card>
      </Link>
    );
  }

  return <Card className={className}>{content}</Card>;
}
