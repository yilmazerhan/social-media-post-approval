import { Construction } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import type { BreadcrumbItem } from "@/components/app/breadcrumbs";

/** A screen this phase names in the nav but hasn't built the feature behind yet — see IMPLEMENTATION_PLAN.md. */
export function ComingSoon({
  title,
  breadcrumbs,
  phaseNote,
}: {
  title: string;
  breadcrumbs?: BreadcrumbItem[];
  phaseNote: string;
}) {
  return (
    <div>
      <PageHeader title={title} breadcrumbs={breadcrumbs} />
      <EmptyState icon={Construction} title={phaseNote} />
    </div>
  );
}
