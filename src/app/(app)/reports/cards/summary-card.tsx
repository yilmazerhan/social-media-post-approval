"use client";

import {
  AlertOctagon,
  CheckCircle2,
  MessageSquareWarning,
  Send,
  XCircle,
} from "lucide-react";
import type { SummaryReport } from "@/modules/reports";
import { StatCard } from "@/components/app/stat-card";
import { ReportCard } from "../report-card";
import { ReportBarChart } from "../report-bar-chart";
import { MetricTable } from "../metric-table";
import { useReportData } from "../use-report-data";

/**
 * Volume by decision, plus the live overdue count — API.md's `/reports/summary`.
 * `overdue` isn't windowed by `from`/`to` (it describes right now, per the
 * service's own JSDoc), so it's called out separately rather than folded into
 * the chart alongside the four historical, date-windowed counts.
 */
export function SummaryCard({ queryString }: { queryString: string }) {
  const { data, loading, error, reload } = useReportData<SummaryReport>(
    "summary",
    queryString,
  );

  const rows = data
    ? [
        { metric: "Submitted", value: data.submitted },
        { metric: "Approved", value: data.approved },
        { metric: "Rejected", value: data.rejected },
        { metric: "Changes requested", value: data.changesRequested },
        { metric: "Overdue (currently)", value: data.overdue },
      ]
    : [];

  return (
    <ReportCard
      title="Volume by decision"
      csvHref={`/api/v1/reports/summary?${queryString}&format=csv`}
      loading={loading}
      error={error}
      onRetry={reload}
      className="lg:col-span-2"
    >
      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatCard label="Submitted" value={data.submitted} icon={Send} />
            <StatCard
              label="Approved"
              value={data.approved}
              icon={CheckCircle2}
              tone="success"
            />
            <StatCard
              label="Rejected"
              value={data.rejected}
              icon={XCircle}
              tone="destructive"
            />
            <StatCard
              label="Changes requested"
              value={data.changesRequested}
              icon={MessageSquareWarning}
              tone="warning"
            />
            <StatCard
              label="Overdue"
              value={data.overdue}
              icon={AlertOctagon}
              tone={data.overdue > 0 ? "destructive" : "default"}
            />
          </div>
          <ReportBarChart
            data={[
              { metric: "Submitted", count: data.submitted },
              { metric: "Approved", count: data.approved },
              { metric: "Rejected", count: data.rejected },
              { metric: "Changes requested", count: data.changesRequested },
            ]}
            xKey="metric"
            yKey="count"
            yLabel="Count"
          />
          <MetricTable rows={rows} valueHeader="Count" />
        </div>
      )}
    </ReportCard>
  );
}
