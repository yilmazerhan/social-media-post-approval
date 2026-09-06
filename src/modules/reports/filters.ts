/**
 * Shared filter shape for every report — API.md: "Every report accepts
 * `from`, `to`, `departmentId`, `priority`". `from`/`to` bound whichever
 * timestamp column each report's own volume is measured against (documented
 * per function in service.ts) — there is no single universal "event time"
 * column across Post/ApprovalAction/ApprovalAssignment.
 */
import type { Priority } from "@/generated/prisma/client";

export interface ReportFilters {
  from?: Date;
  to?: Date;
  departmentId?: string;
  priority?: Priority;
}

/** A Post-level filter fragment usable directly in a `where`, or spread into one that also filters on other Post columns. */
export function postFilter(filters: ReportFilters) {
  return {
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
  };
}
