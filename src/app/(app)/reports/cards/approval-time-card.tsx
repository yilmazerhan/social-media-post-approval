"use client";

import type { ApprovalTimeReport } from "@/modules/reports";
import { StatCard } from "@/components/app/stat-card";
import { Timer } from "lucide-react";
import { ReportCard } from "../report-card";
import { MetricTable } from "../metric-table";
import { useReportData } from "../use-report-data";

/**
 * Average submission-to-decision time — API.md's `/reports/approval-time`.
 * A single average over a single count has no natural breakdown to chart
 * (UI_UX_SPEC.md's "never a chart alone" bars a chart with no table, not a
 * table with no chart) — a stat tile plus its table is the whole story here.
 */
export function ApprovalTimeCard({ queryString }: { queryString: string }) {
  const { data, loading, error, reload } = useReportData<ApprovalTimeReport>(
    "approval-time",
    queryString,
  );

  return (
    <ReportCard
      title="Average approval time"
      csvHref={`/api/v1/reports/approval-time?${queryString}&format=csv`}
      loading={loading}
      error={error}
      onRetry={reload}
    >
      {data && (
        <div className="space-y-4">
          <StatCard
            label="Average minutes"
            value={data.avgMinutes ?? "—"}
            icon={Timer}
          />
          <MetricTable
            rows={[
              { metric: "Decided", value: data.decided },
              { metric: "Average minutes", value: data.avgMinutes ?? "—" },
            ]}
          />
        </div>
      )}
    </ReportCard>
  );
}
