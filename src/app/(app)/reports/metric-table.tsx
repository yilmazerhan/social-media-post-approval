import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** A small, fixed-row metric/value table — the shape `summary`, `approval-time` and `sla-compliance` all export as CSV. Too few rows to need DataTable's sort/pagination/column-visibility chrome. */
export function MetricTable({
  rows,
  valueHeader = "Value",
}: {
  rows: { metric: string; value: string | number }[];
  valueHeader?: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Metric</TableHead>
          <TableHead>{valueHeader}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.metric}>
            <TableCell>{row.metric}</TableCell>
            <TableCell>{row.value}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
