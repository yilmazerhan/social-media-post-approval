"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ReportFilterValues } from "./filters";

/**
 * UI_UX_SPEC.md's `/reports` filter bar: "date range, department, priority,
 * creator, approver". `creator`/`approver` aren't accepted by the report API
 * (API.md's reports contract is `from`/`to`/`departmentId`/`priority` only)
 * — the by-creator and by-approver cards get their own client-side name
 * search instead (see `cards/grouped-volume-card.tsx`).
 */
export function ReportFilterBar({
  draft,
  onDraftChange,
  onApply,
  onClear,
  departments,
}: {
  draft: ReportFilterValues;
  onDraftChange: (next: ReportFilterValues) => void;
  onApply: () => void;
  onClear: () => void;
  departments: { id: string; name: string }[];
}) {
  const hasActiveFilters =
    draft.from || draft.to || draft.departmentId || draft.priority;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onApply();
      }}
      className="flex flex-wrap items-end gap-3"
    >
      <div className="space-y-1.5">
        <Label htmlFor="report-filter-from">From</Label>
        <Input
          id="report-filter-from"
          type="date"
          value={draft.from}
          max={draft.to || undefined}
          onChange={(e) => onDraftChange({ ...draft, from: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="report-filter-to">To</Label>
        <Input
          id="report-filter-to"
          type="date"
          value={draft.to}
          min={draft.from || undefined}
          onChange={(e) => onDraftChange({ ...draft, to: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="report-filter-department">Department</Label>
        <Select
          value={draft.departmentId || undefined}
          onValueChange={(v) => onDraftChange({ ...draft, departmentId: v })}
        >
          <SelectTrigger id="report-filter-department" className="w-44">
            <SelectValue placeholder="All departments" />
          </SelectTrigger>
          <SelectContent>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="report-filter-priority">Priority</Label>
        <Select
          value={draft.priority || undefined}
          onValueChange={(v) => onDraftChange({ ...draft, priority: v })}
        >
          <SelectTrigger id="report-filter-priority" className="w-36">
            <SelectValue placeholder="All priorities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="LOW">Low</SelectItem>
            <SelectItem value="NORMAL">Normal</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
            <SelectItem value="URGENT">Urgent</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit">Apply filters</Button>
      {hasActiveFilters && (
        <Button type="button" variant="ghost" onClick={onClear}>
          Clear filters
        </Button>
      )}
    </form>
  );
}
