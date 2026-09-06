"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import type { ColumnDef } from "@tanstack/react-table";
import { ScrollText } from "lucide-react";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, getJson } from "@/lib/api-client";

interface AuditLogDto {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
}

/** Read-only — AuditLog is append-only (CLAUDE.md, SECURITY.md): no edit or delete affordance exists anywhere in this section. */
export function AuditLogsSection() {
  const [logs, setLogs] = useState<AuditLogDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [actionFilter, setActionFilter] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [actorIdFilter, setActorIdFilter] = useState("");

  async function load(filters?: {
    action?: string;
    entityType?: string;
    actorId?: string;
  }) {
    setError(null);
    try {
      const params = new URLSearchParams({ pageSize: "100" });
      const action = filters?.action ?? actionFilter;
      const entityType = filters?.entityType ?? entityTypeFilter;
      const actorId = filters?.actorId ?? actorIdFilter;
      if (action) params.set("action", action);
      if (entityType) params.set("entityType", entityType);
      if (actorId) params.set("actorId", actorId);
      const data = await getJson<AuditLogDto[]>(
        `/api/v1/admin/audit-logs?${params.toString()}`,
      );
      setLogs(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount; the filter bar re-fetches explicitly.
  }, []);

  const columns: ColumnDef<AuditLogDto>[] = [
    {
      accessorKey: "createdAt",
      header: "When",
      cell: ({ row }) =>
        format(new Date(row.original.createdAt), "d MMM yyyy HH:mm:ss"),
    },
    {
      accessorKey: "actorEmail",
      header: "Actor",
      cell: ({ row }) => row.original.actorEmail ?? "System",
    },
    { accessorKey: "action", header: "Action" },
    { accessorKey: "entityType", header: "Entity type" },
    {
      accessorKey: "entityId",
      header: "Entity id",
      cell: ({ row }) => row.original.entityId ?? "—",
    },
  ];

  if (error) return <ErrorState message={error} onRetry={() => load()} />;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Audit logs</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <div className="space-y-1.5">
          <Label htmlFor="audit-filter-action">Action</Label>
          <Input
            id="audit-filter-action"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            placeholder="USER_CREATED"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audit-filter-entity-type">Entity type</Label>
          <Input
            id="audit-filter-entity-type"
            value={entityTypeFilter}
            onChange={(e) => setEntityTypeFilter(e.target.value)}
            placeholder="User"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audit-filter-actor">Actor id</Label>
          <Input
            id="audit-filter-actor"
            value={actorIdFilter}
            onChange={(e) => setActorIdFilter(e.target.value)}
          />
        </div>
        <Button type="submit" variant="outline">
          Apply filters
        </Button>
      </form>

      {!logs ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : logs.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No audit entries match these filters."
        />
      ) : (
        <DataTable
          columns={columns}
          data={logs}
          emptyMessage="No audit entries."
        />
      )}
    </div>
  );
}
