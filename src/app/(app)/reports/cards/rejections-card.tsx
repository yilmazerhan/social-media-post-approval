"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ThumbsDown } from "lucide-react";
import type { RejectionReasonRow } from "@/modules/reports";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { ReportCard } from "../report-card";
import { ReportBarChart } from "../report-bar-chart";
import { useReportData } from "../use-report-data";

const MAX_CHART_ROWS = 8;

const columns: ColumnDef<RejectionReasonRow>[] = [
  { accessorKey: "reason", header: "Reason" },
  { accessorKey: "count", header: "Count" },
];

/**
 * Rejection reasons — API.md's `/reports/rejections`. Reasons are free
 * text an approver typed, not a fixed enum (service.ts), so there's no
 * natural bar-per-category chart the way department/creator/approver have —
 * a horizontal bar of the top reasons by count stands in, so this card
 * still has a chart alongside its table rather than a table alone.
 */
export function RejectionsCard({ queryString }: { queryString: string }) {
  const { data, loading, error, reload } = useReportData<RejectionReasonRow[]>(
    "rejections",
    queryString,
  );

  const rows = data ?? [];

  return (
    <ReportCard
      title="Rejection reasons"
      csvHref={`/api/v1/reports/rejections?${queryString}&format=csv`}
      loading={loading}
      error={error}
      onRetry={reload}
    >
      {data &&
        (rows.length === 0 ? (
          <EmptyState icon={ThumbsDown} title="No rejections in this range." />
        ) : (
          <div className="space-y-4">
            <ReportBarChart
              data={rows
                .slice(0, MAX_CHART_ROWS)
                .map((r) => ({ reason: r.reason, count: r.count }))}
              xKey="reason"
              yKey="count"
              yLabel="Count"
              horizontal
            />
            <DataTable columns={columns} data={rows} emptyMessage="No rows." />
          </div>
        ))}
    </ReportCard>
  );
}
