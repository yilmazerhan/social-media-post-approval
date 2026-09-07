import { Breadcrumbs, type BreadcrumbItem } from "@/components/app/breadcrumbs";

/** One `h1` per page (UI_UX_SPEC.md §9), paired with the breadcrumb trail above it. */
export function PageHeader({
  title,
  breadcrumbs,
  actions,
}: {
  title: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 pb-4">
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
