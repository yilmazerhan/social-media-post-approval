/**
 * Client-side filter shape for `/reports` — API.md's shared `?from=&to=&departmentId=&priority=`
 * contract. Dates are plain `yyyy-MM-dd` strings (native `<input type="date">` values); this
 * module turns them into the ISO-with-time bounds the API expects.
 */
export interface ReportFilterValues {
  from: string;
  to: string;
  departmentId: string;
  priority: string;
}

const DEFAULT_RANGE_DAYS = 30;

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function defaultReportFilters(): ReportFilterValues {
  const now = new Date();
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - DEFAULT_RANGE_DAYS);
  return {
    from: toDateInputValue(from),
    to: toDateInputValue(now),
    departmentId: "",
    priority: "",
  };
}

export const EMPTY_REPORT_FILTERS: ReportFilterValues = {
  from: "",
  to: "",
  departmentId: "",
  priority: "",
};

/** `to` is bounded inclusive of the whole calendar day the user picked. */
export function buildReportQuery(filters: ReportFilterValues): string {
  const params = new URLSearchParams();
  if (filters.from)
    params.set("from", new Date(`${filters.from}T00:00:00.000Z`).toISOString());
  if (filters.to)
    params.set("to", new Date(`${filters.to}T23:59:59.999Z`).toISOString());
  if (filters.departmentId) params.set("departmentId", filters.departmentId);
  if (filters.priority) params.set("priority", filters.priority);
  return params.toString();
}
