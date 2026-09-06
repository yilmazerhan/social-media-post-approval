"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import type { ColumnDef } from "@tanstack/react-table";
import { Inbox } from "lucide-react";
import type { QueueRow } from "@/modules/approvals";
import { getJson, postJson, CSRF_COOKIE_NAME } from "@/lib/api-client";
import { DataTable } from "@/components/app/data-table";
import { StatusBadge } from "@/components/app/status-badge";
import { PriorityBadge } from "@/components/app/priority-badge";
import { EmptyState } from "@/components/app/empty-state";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

/**
 * UI_UX_SPEC.md §6: "Same table machinery [as My Posts], default sort by
 * due date ascending, with quick filters Overdue / Due today / Unassigned
 * / My group, and bulk assign (never bulk approve)." Fetches up to 100
 * matching rows per DataTable's own client-side pagination (its own
 * comment already anticipates a future server-paginated mode — this
 * screen doesn't need one yet at this scale); server-side filtering,
 * scoping and true pagination are proven directly against the API in
 * `tests/integration/approval-queue.test.ts`.
 */

interface Filters {
  overdue: boolean;
  dueToday: boolean;
  unassigned: boolean;
  myGroupOnly: boolean;
  priority: string;
  departmentId: string;
}

const EMPTY_FILTERS: Filters = {
  overdue: false,
  dueToday: false,
  unassigned: false,
  myGroupOnly: false,
  priority: "",
  departmentId: "",
};

function buildQueryString(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.overdue) params.set("overdue", "1");
  if (filters.dueToday) params.set("dueToday", "1");
  if (filters.unassigned) params.set("unassigned", "1");
  if (filters.myGroupOnly) params.set("myGroupOnly", "1");
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.departmentId) params.set("departmentId", filters.departmentId);
  params.set("pageSize", "100");
  return params.toString();
}

function formatDate(value: string | null): string {
  return value ? format(new Date(value), "d MMM yyyy") : "—";
}

function QuickFilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="sm"
      onClick={onClick}
      aria-pressed={active}
    >
      {label}
    </Button>
  );
}

export function ApprovalQueueView({
  departments,
}: {
  departments: { id: string; name: string }[];
}) {
  const { toast } = useToast();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignKind, setAssignKind] = useState<"user" | "group">("user");
  const [assignTargetId, setAssignTargetId] = useState("");
  const [assignSubmitting, setAssignSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getJson<QueueRow[]>(`/api/v1/approvals/queue?${buildQueryString(filters)}`)
      .then((result) => {
        if (!cancelled) {
          setRows(result);
          setSelected(new Set());
        }
      })
      .catch(() => {
        if (!cancelled) {
          toast({
            title: "Couldn't load the queue.",
            variant: "destructive",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast identity is stable enough here.
  }, [filters]);

  function toggleQuickFilter(key: keyof Filters) {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleRow(postId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === rows.length
        ? new Set()
        : new Set(rows.map((r) => r.postId)),
    );
  }

  async function submitBulkAssign() {
    if (!assignTargetId.trim()) return;
    setAssignSubmitting(true);
    const postIds = Array.from(selected);
    const input =
      assignKind === "user"
        ? { assigneeUserId: assignTargetId.trim() }
        : { assigneeGroupId: assignTargetId.trim() };
    const results = await Promise.allSettled(
      postIds.map((postId) =>
        postJson(`/api/v1/approvals/${postId}/assign`, input, {
          csrfCookieName: CSRF_COOKIE_NAME,
        }),
      ),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    setAssignSubmitting(false);
    setAssignOpen(false);
    setAssignTargetId("");
    if (failed > 0) {
      toast({
        title: `${postIds.length - failed} of ${postIds.length} assigned`,
        description: `${failed} could not be reassigned.`,
        variant: "destructive",
      });
    } else {
      toast({ title: `${postIds.length} post(s) reassigned.` });
    }
    setFilters((prev) => ({ ...prev }));
  }

  const columns: ColumnDef<QueueRow>[] = [
    {
      id: "select",
      header: () => (
        <input
          type="checkbox"
          aria-label="Select all"
          checked={rows.length > 0 && selected.size === rows.length}
          onChange={toggleAll}
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label={`Select ${row.original.title || row.original.reference}`}
          checked={selected.has(row.original.postId)}
          onChange={() => toggleRow(row.original.postId)}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => (
        <Link
          href={`/approvals/${row.original.postId}`}
          className="font-medium hover:underline"
        >
          {row.original.title || row.original.reference}
        </Link>
      ),
    },
    {
      accessorKey: "priority",
      header: "Priority",
      cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "departmentName",
      header: "Department",
      cell: ({ row }) => row.original.departmentName ?? "—",
    },
    {
      accessorKey: "versionNumber",
      header: "Version",
    },
    {
      accessorKey: "assigneeKind",
      header: "Assigned to",
      cell: ({ row }) =>
        row.original.assigneeKind === "USER" ? "Me" : "My group",
    },
    {
      accessorKey: "submittedAt",
      header: "Submitted",
      cell: ({ row }) => formatDate(row.original.submittedAt),
    },
    {
      accessorKey: "dueAt",
      header: "Due",
      cell: ({ row }) => formatDate(row.original.dueAt),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <QuickFilterChip
          label="Overdue"
          active={filters.overdue}
          onClick={() => toggleQuickFilter("overdue")}
        />
        <QuickFilterChip
          label="Due today"
          active={filters.dueToday}
          onClick={() => toggleQuickFilter("dueToday")}
        />
        <QuickFilterChip
          label="Unassigned"
          active={filters.unassigned}
          onClick={() => toggleQuickFilter("unassigned")}
        />
        <QuickFilterChip
          label="My group"
          active={filters.myGroupOnly}
          onClick={() => toggleQuickFilter("myGroupOnly")}
        />

        <Select
          value={filters.priority || undefined}
          onValueChange={(v) =>
            setFilters((prev) => ({ ...prev, priority: v }))
          }
        >
          <SelectTrigger aria-label="Filter by priority" className="w-36">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="LOW">Low</SelectItem>
            <SelectItem value="NORMAL">Normal</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
            <SelectItem value="URGENT">Urgent</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.departmentId || undefined}
          onValueChange={(v) =>
            setFilters((prev) => ({ ...prev, departmentId: v }))
          }
        >
          <SelectTrigger aria-label="Filter by department" className="w-44">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(filters.overdue ||
          filters.dueToday ||
          filters.unassigned ||
          filters.myGroupOnly ||
          filters.priority ||
          filters.departmentId) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setFilters(EMPTY_FILTERS)}
          >
            Clear filters
          </Button>
        )}

        {selected.size > 0 && (
          <Button
            type="button"
            size="sm"
            className="ml-auto"
            onClick={() => setAssignOpen(true)}
          >
            Assign {selected.size} selected
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading queue…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={Inbox} title="Nothing in your queue right now." />
      ) : (
        <DataTable columns={columns} data={rows} emptyMessage="Nothing here." />
      )}

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign {selected.size} post(s)</DialogTitle>
            <DialogDescription>
              Redirects the open assignment on each selected post. A full
              people-picker arrives with the Administration screens — for now,
              enter the target&rsquo;s ID directly.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={assignKind === "user" ? "default" : "outline"}
                size="sm"
                onClick={() => setAssignKind("user")}
              >
                User
              </Button>
              <Button
                type="button"
                variant={assignKind === "group" ? "default" : "outline"}
                size="sm"
                onClick={() => setAssignKind("group")}
              >
                Group
              </Button>
            </div>
            <div>
              <Label htmlFor="assign-target-id">
                {assignKind === "user" ? "User ID" : "Group ID"}
              </Label>
              <Input
                id="assign-target-id"
                value={assignTargetId}
                onChange={(e) => setAssignTargetId(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAssignOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submitBulkAssign}
              disabled={assignSubmitting || !assignTargetId.trim()}
            >
              {assignSubmitting ? "Assigning…" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
