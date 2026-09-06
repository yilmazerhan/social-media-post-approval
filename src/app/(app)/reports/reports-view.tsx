"use client";

import { useMemo, useState } from "react";
import {
  buildReportQuery,
  defaultReportFilters,
  EMPTY_REPORT_FILTERS,
  type ReportFilterValues,
} from "./filters";
import { ReportFilterBar } from "./report-filter-bar";
import { SummaryCard } from "./cards/summary-card";
import { ThroughputCard } from "./cards/throughput-card";
import { ApprovalTimeCard } from "./cards/approval-time-card";
import { SlaComplianceCard } from "./cards/sla-compliance-card";
import { GroupedVolumeCard } from "./cards/grouped-volume-card";
import { RejectionsCard } from "./cards/rejections-card";

/**
 * UI_UX_SPEC.md's `/reports` screen: one filter bar over eight report
 * cards, each exporting its own CSV. `queryString` is built once here and
 * shared by every card, so "Apply filters" refetches all eight together.
 */
export function ReportsView({
  departments,
}: {
  departments: { id: string; name: string }[];
}) {
  const [draft, setDraft] = useState<ReportFilterValues>(defaultReportFilters);
  const [applied, setApplied] =
    useState<ReportFilterValues>(defaultReportFilters);

  const queryString = useMemo(() => buildReportQuery(applied), [applied]);

  return (
    <div className="space-y-6">
      <ReportFilterBar
        draft={draft}
        onDraftChange={setDraft}
        onApply={() => setApplied(draft)}
        onClear={() => {
          setDraft(EMPTY_REPORT_FILTERS);
          setApplied(EMPTY_REPORT_FILTERS);
        }}
        departments={departments}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SummaryCard queryString={queryString} />
        <ThroughputCard queryString={queryString} />
        <ApprovalTimeCard queryString={queryString} />
        <SlaComplianceCard queryString={queryString} />
        <GroupedVolumeCard
          title="Volume by department"
          path="by-department"
          labelHeader="Department"
          queryString={queryString}
        />
        <GroupedVolumeCard
          title="Volume by creator"
          path="by-creator"
          labelHeader="Creator"
          queryString={queryString}
          searchLabel="Filter by creator name"
        />
        <GroupedVolumeCard
          title="Volume by approver"
          path="by-approver"
          labelHeader="Approver"
          queryString={queryString}
          searchLabel="Filter by approver name"
        />
        <RejectionsCard queryString={queryString} />
      </div>
    </div>
  );
}
