"use client";

import { useEffect, useState } from "react";
import { Workflow } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, getJson } from "@/lib/api-client";

interface TransitionRow {
  from: string;
  action: string;
  to: string;
}

/** Read-only render of the one legal-transition table `state-machine.ts` owns — UI_UX_SPEC.md §6. */
export function WorkflowSection() {
  const [transitions, setTransitions] = useState<TransitionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const data = await getJson<TransitionRow[]>(
        "/api/v1/admin/workflow-transitions",
      );
      setTransitions(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!transitions)
    return <p className="text-muted-foreground text-sm">Loading…</p>;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Workflow</h2>
      {transitions.length === 0 ? (
        <EmptyState icon={Workflow} title="No transitions defined." />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>From status</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>To status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transitions.map((t, index) => (
                <TableRow key={`${t.from}-${t.action}-${index}`}>
                  <TableCell>{t.from}</TableCell>
                  <TableCell>{t.action}</TableCell>
                  <TableCell>{t.to}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
