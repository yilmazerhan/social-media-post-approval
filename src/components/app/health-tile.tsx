import Link from "next/link";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HealthStatus } from "@/server/health";

const STATUS_CONFIG: Record<
  HealthStatus,
  { icon: typeof CheckCircle2; text: string; label: string }
> = {
  healthy: { icon: CheckCircle2, text: "text-success", label: "Healthy" },
  degraded: { icon: AlertTriangle, text: "text-warning", label: "Degraded" },
  down: { icon: XCircle, text: "text-destructive", label: "Down" },
};

/** One admin dashboard health tile — UI_UX_SPEC.md §6, linking to the relevant admin page. */
export function HealthTile({
  label,
  status,
  detail,
  href,
}: {
  label: string;
  status: HealthStatus;
  detail: string;
  href: string;
}) {
  const { icon: Icon, text, label: statusLabel } = STATUS_CONFIG[status];
  return (
    <Link
      href={href}
      className="focus-visible:ring-ring block rounded-xl focus-visible:ring-2 focus-visible:outline-none"
    >
      <Card className="hover:border-ring transition-colors">
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle>{label}</CardTitle>
          <span
            className={`flex items-center gap-1 text-xs font-medium ${text}`}
          >
            <Icon className="size-4" aria-hidden />
            {statusLabel}
          </span>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{detail}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
