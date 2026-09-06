"use client";

import { ShieldCheck } from "lucide-react";
import type { SlaComplianceReport } from "@/modules/reports";
import { StatCard } from "@/components/app/stat-card";
import { ReportCard } from "../report-card";
import { ReportBarChart } from "../report-bar-chart";
import { MetricTable } from "../metric-table";
import { useReportData } from "../use-report-data";

/** On-time vs. breached completions — API.md's `/reports/sla-compliance`. */
export function SlaComplianceCard({ queryString }: { queryString: string }) {
  const { data, loading, error, reload } = useReportData<SlaComplianceReport>(
    "sla-compliance",
    queryString,
  );

  const breached = data ? data.decided - data.onTime : 0;

  return (
    <ReportCard
      title="SLA compliance"
      csvHref={`/api/v1/reports/sla-compliance?${queryString}&format=csv`}
      loading={loading}
      error={error}
      onRetry={reload}
    >
      {data && (
        <div className="space-y-4">
          <StatCard
            label="Compliance"
            value={
              data.compliancePercent === null
                ? "—"
                : `${data.compliancePercent}%`
            }
            icon={ShieldCheck}
            tone={
              data.compliancePercent === null
                ? "default"
                : data.compliancePercent >= 90
                  ? "success"
                  : "warning"
            }
          />
          {data.decided > 0 && (
            <ReportBarChart
              data={[
                { status: "On time", count: data.onTime },
                { status: "Breached", count: breached },
              ]}
              xKey="status"
              yKey="count"
              yLabel="Count"
            />
          )}
          <MetricTable
            rows={[
              { metric: "Decided", value: data.decided },
              { metric: "On time", value: data.onTime },
              {
                metric: "Compliance percent",
                value: data.compliancePercent ?? "—",
              },
            ]}
          />
        </div>
      )}
    </ReportCard>
  );
}
