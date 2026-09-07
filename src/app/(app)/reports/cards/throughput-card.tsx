"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { TrendingUp } from "lucide-react";
import type { ThroughputPoint } from "@/modules/reports";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { ReportCard } from "../report-card";
import { ReportBarChart } from "../report-bar-chart";
import { useReportData } from "../use-report-data";

const columns: ColumnDef<ThroughputPoint>[] = [
  { accessorKey: "date", header: "Date" },
  { accessorKey: "submitted", header: "Submitted" },
];

/** Daily submission volume — API.md's `/reports/throughput`. */
export function ThroughputCard({ queryString }: { queryString: string }) {
  const { data, loading, error, reload } = useReportData<ThroughputPoint[]>(
    "throughput",
    queryString,
  );

  return (
    <ReportCard
      title="Volume over time"
      csvHref={`/api/v1/reports/throughput?${queryString}&format=csv`}
      loading={loading}
      error={error}
      onRetry={reload}
      className="lg:col-span-2"
    >
      {data &&
        (data.length === 0 ? (
          <EmptyState icon={TrendingUp} title="No submissions in this range." />
        ) : (
          <div className="space-y-4">
            <ReportBarChart
              data={data.map((p) => ({ date: p.date, submitted: p.submitted }))}
              xKey="date"
              yKey="submitted"
              yLabel="Submitted"
            />
            <DataTable
              columns={columns}
              data={data}
              emptyMessage="No submissions."
            />
          </div>
        ))}
    </ReportCard>
  );
}
