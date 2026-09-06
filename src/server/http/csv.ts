/**
 * CSV export — API.md: "CSV is streamed with a `text/csv` content type and
 * a formula-injection guard on leading `= + - @` characters." SECURITY.md's
 * control table spells out the exact guard: leading `= + - @ \t \r` get a
 * `'` prefix, the standard mitigation for a spreadsheet app treating an
 * exported cell as a formula. Shared by every CSV-exporting route (reports,
 * audit logs) — one guard, not one per feature.
 */
const DANGEROUS_LEADING_CHARS = ["=", "+", "-", "@", "\t", "\r"];

function escapeCell(value: string): string {
  const guarded = DANGEROUS_LEADING_CHARS.includes(value.charAt(0))
    ? `'${value}`
    : value;
  if (/[",\n]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

/** Renders a flat array of objects as CSV — first row is the given column headers. */
export function toCsv<T extends object>(
  rows: T[],
  columns: { key: keyof T; header: string }[],
): string {
  const lines = [columns.map((c) => escapeCell(c.header)).join(",")];
  for (const row of rows) {
    lines.push(
      columns.map((c) => escapeCell(String(row[c.key] ?? ""))).join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}
