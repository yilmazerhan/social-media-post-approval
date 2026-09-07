"use client";

import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Users } from "lucide-react";
import type { GroupedVolumeRow } from "@/modules/reports";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReportCard } from "../report-card";
import { ReportBarChart } from "../report-bar-chart";
import { useReportData } from "../use-report-data";

const MAX_CHART_ROWS = 10;

/**
 * Decided-post (or completed-assignment) volume grouped by department,
 * creator or approver — API.md's `/reports/by-department`,
 * `/reports/by-creator`, `/reports/by-approver`. All three share this exact
 * `GroupedVolumeRow` shape, so one component renders all three report cards.
 *
 * UI_UX_SPEC.md's filter bar lists "creator, approver" as fields, but the
 * report API only accepts `from`/`to`/`departmentId`/`priority` (API.md) —
 * `searchLabel` adds a small client-side name search over the rows already
 * fetched for this card, standing in for that filter without inventing a
 * query param the backend doesn't support.
 */
export function GroupedVolumeCard({
  title,
  path,
  labelHeader,
  queryString,
  searchLabel,
}: {
  title: string;
  path: "by-department" | "by-creator" | "by-approver";
  labelHeader: string;
  queryString: string;
  searchLabel?: string;
}) {
  const { data, loading, error, reload } = useReportData<GroupedVolumeRow[]>(
    path,
    queryString,
  );
  const [search, setSearch] = useState("");

  const rows = data ?? [];
  const filteredRows = search.trim()
    ? rows.filter((r) =>
        r.label.toLowerCase().includes(search.trim().toLowerCase()),
      )
    : rows;

  const columns: ColumnDef<GroupedVolumeRow>[] = [
    { accessorKey: "label", header: labelHeader },
    { accessorKey: "count", header: "Decided" },
    {
      accessorKey: "avgApprovalMinutes",
      header: "Average minutes",
      cell: ({ row }) => row.original.avgApprovalMinutes ?? "—",
    },
  ];

  return (
    <ReportCard
      title={title}
      csvHref={`/api/v1/reports/${path}?${queryString}&format=csv`}
      loading={loading}
      error={error}
      onRetry={reload}
    >
      {data &&
        (rows.length === 0 ? (
          <EmptyState icon={Users} title="No decided posts in this range." />
        ) : (
          <div className="space-y-4">
            {searchLabel && (
              <div className="space-y-1.5">
                <Label htmlFor={`${path}-search`}>{searchLabel}</Label>
                <Input
                  id={`${path}-search`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter by name…"
                  className="max-w-xs"
                />
              </div>
            )}
            {filteredRows.length === 0 ? (
              <EmptyState icon={Users} title="No match for this name." />
            ) : (
              <>
                <ReportBarChart
                  data={filteredRows
                    .slice(0, MAX_CHART_ROWS)
                    .map((r) => ({ label: r.label, count: r.count }))}
                  xKey="label"
                  yKey="count"
                  yLabel="Decided"
                />
                <DataTable
                  columns={columns}
                  data={filteredRows}
                  emptyMessage="No rows."
                />
              </>
            )}
          </div>
        ))}
    </ReportCard>
  );
}
