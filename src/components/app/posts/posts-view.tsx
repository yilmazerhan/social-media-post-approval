"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import type { PostListRow, PostListTab } from "@/modules/posts";
import {
  getJson,
  postJson,
  deleteJson,
  CSRF_COOKIE_NAME,
} from "@/lib/api-client";
import { DataTable } from "@/components/app/data-table";
import { StatusBadge } from "@/components/app/status-badge";
import { PriorityBadge } from "@/components/app/priority-badge";
import { SLAIndicator } from "@/components/app/sla-indicator";
import { ConfirmationDialog } from "@/components/app/confirmation-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

/**
 * UI_UX_SPEC.md §6's "My Posts": tabs over a `DataTable`, search, filters
 * (status via tab, priority, department, date range), sorting, pagination
 * and column visibility (the last three are `DataTable`'s own job).
 * Same fetch-on-filter-change shape as `ApprovalQueueView` — up to
 * `list.ts`'s own 200-row cap, everything server-side except
 * sort/paginate/column-visibility.
 */

const TABS: { value: PostListTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "drafts", label: "Drafts" },
  { value: "pending", label: "Pending approval" },
  { value: "changes_requested", label: "Changes requested" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "archived", label: "Archived" },
];

interface Filters {
  tab: PostListTab;
  search: string;
  priority: string;
  departmentId: string;
  dateFrom: string;
  dateTo: string;
}

const EMPTY_FILTERS: Filters = {
  tab: "all",
  search: "",
  priority: "",
  departmentId: "",
  dateFrom: "",
  dateTo: "",
};

/** The dashboard's stat-card links (`/posts?status=DRAFT` etc.) use Post's own status enum, not a tab key. */
const STATUS_TO_TAB: Record<string, PostListTab> = {
  DRAFT: "drafts",
  SUBMITTED: "pending",
  IN_REVIEW: "pending",
  CHANGES_REQUESTED: "changes_requested",
  APPROVED: "approved",
  REJECTED: "rejected",
  ARCHIVED: "archived",
};

function buildQueryString(filters: Filters): string {
  const params = new URLSearchParams();
  params.set("tab", filters.tab);
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.departmentId) params.set("departmentId", filters.departmentId);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  return params.toString();
}

function formatDate(value: string | null): string {
  return value ? format(new Date(value), "d MMM yyyy") : "—";
}

export function PostsView({
  departments,
}: {
  departments: { id: string; name: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const initialStatus = searchParams.get("status");
  const [filters, setFilters] = useState<Filters>({
    ...EMPTY_FILTERS,
    tab: (initialStatus && STATUS_TO_TAB[initialStatus]) || EMPTY_FILTERS.tab,
  });
  const [rows, setRows] = useState<PostListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<PostListRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [submitTarget, setSubmitTarget] = useState<PostListRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  function refresh() {
    setFilters((prev) => ({ ...prev }));
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getJson<PostListRow[]>(`/api/v1/posts?${buildQueryString(filters)}`)
      .then((result) => {
        if (!cancelled) setRows(result);
      })
      .catch(() => {
        if (!cancelled) {
          toast({ title: "Couldn't load your posts.", variant: "destructive" });
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

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteJson(`/api/v1/posts/${deleteTarget.id}`, {
        csrfCookieName: CSRF_COOKIE_NAME,
      });
      toast({ title: "Draft deleted." });
      setDeleteTarget(null);
      refresh();
    } catch {
      toast({ title: "Couldn't delete this draft.", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  async function confirmSubmit() {
    if (!submitTarget) return;
    setSubmitting(true);
    try {
      await postJson(
        `/api/v1/posts/${submitTarget.id}/submit`,
        { lockVersion: submitTarget.lockVersion },
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      toast({ title: "Submitted for approval." });
      setSubmitTarget(null);
      refresh();
    } catch (err) {
      toast({
        title: "Couldn't submit this post.",
        description:
          err instanceof Error
            ? err.message
            : "Open it in the editor to see what's missing.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function duplicate(row: PostListRow) {
    setDuplicatingId(row.id);
    try {
      const result = await postJson<{ id: string }>(
        `/api/v1/posts/${row.id}/duplicate`,
        {},
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      toast({ title: "Post duplicated." });
      router.push(`/posts/${result.id}/edit`);
    } catch {
      toast({ title: "Couldn't duplicate this post.", variant: "destructive" });
      setDuplicatingId(null);
    }
  }

  const columns: ColumnDef<PostListRow>[] = [
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => (
        <Link
          href={
            row.original.status === "DRAFT" ||
            row.original.status === "CHANGES_REQUESTED"
              ? `/posts/${row.original.id}/edit`
              : `/posts/${row.original.id}`
          }
          className="font-medium hover:underline"
        >
          {row.original.title || row.original.reference}
        </Link>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "priority",
      header: "Priority",
      cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
    },
    {
      accessorKey: "versionNumber",
      header: "Version",
      cell: ({ row }) => row.original.versionNumber ?? "—",
    },
    {
      accessorKey: "submittedAt",
      header: "Submitted",
      cell: ({ row }) => formatDate(row.original.submittedAt),
    },
    {
      accessorKey: "approverName",
      header: "Approver",
      cell: ({ row }) => row.original.approverName ?? "—",
    },
    {
      id: "sla",
      header: "SLA",
      enableSorting: false,
      cell: ({ row }) =>
        row.original.slaPercentElapsed !== null ? (
          <SLAIndicator
            percentElapsed={row.original.slaPercentElapsed}
            remainderText={`${row.original.slaPercentElapsed}%`}
          />
        ) : (
          "—"
        ),
    },
    {
      accessorKey: "updatedAt",
      header: "Last updated",
      cell: ({ row }) => formatDate(row.original.updatedAt),
    },
    {
      id: "actions",
      header: "Actions",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const post = row.original;
        const items: { label: string; onClick: () => void }[] = [];
        switch (post.status) {
          case "DRAFT":
            items.push(
              {
                label: "Edit",
                onClick: () => router.push(`/posts/${post.id}/edit`),
              },
              { label: "Submit", onClick: () => setSubmitTarget(post) },
              { label: "Delete", onClick: () => setDeleteTarget(post) },
            );
            break;
          case "CHANGES_REQUESTED":
            items.push(
              {
                label: "Edit",
                onClick: () => router.push(`/posts/${post.id}/edit`),
              },
              {
                label: "View feedback",
                onClick: () => router.push(`/posts/${post.id}`),
              },
              { label: "Resubmit", onClick: () => setSubmitTarget(post) },
            );
            break;
          case "APPROVED":
          case "REJECTED":
            items.push(
              {
                label: "View",
                onClick: () => router.push(`/posts/${post.id}`),
              },
              { label: "Duplicate", onClick: () => duplicate(post) },
            );
            break;
          default:
            items.push({
              label: "View",
              onClick: () => router.push(`/posts/${post.id}`),
            });
        }
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Actions for ${post.title || post.reference}`}
                disabled={duplicatingId === post.id}
              >
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {items.map((item) => (
                <DropdownMenuItem key={item.label} onSelect={item.onClick}>
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <Tabs
        value={filters.tab}
        onValueChange={(v) =>
          setFilters((prev) => ({ ...prev, tab: v as PostListTab }))
        }
      >
        <TabsList className="flex-wrap">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* One shared panel, filtered server-side by the active tab —
            same pattern as NotificationsView's all/unread/mentions tabs. */}
        <TabsContent value={filters.tab} className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={filters.search}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, search: e.target.value }))
              }
              placeholder="Search posts…"
              className="w-56"
              aria-label="Search posts"
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

            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                aria-label="From date"
                value={filters.dateFrom}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    dateFrom: e.target.value,
                  }))
                }
                className="w-36"
              />
              <span className="text-muted-foreground text-sm">to</span>
              <Input
                type="date"
                aria-label="To date"
                value={filters.dateTo}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, dateTo: e.target.value }))
                }
                className="w-36"
              />
            </div>

            {(filters.search ||
              filters.priority ||
              filters.departmentId ||
              filters.dateFrom ||
              filters.dateTo) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setFilters((prev) => ({ ...EMPTY_FILTERS, tab: prev.tab }))
                }
              >
                Clear filters
              </Button>
            )}
          </div>

          {loading ? (
            <p className="text-muted-foreground text-sm">Loading posts…</p>
          ) : (
            <DataTable
              columns={columns}
              data={rows}
              emptyMessage="No posts match these filters."
            />
          )}
        </TabsContent>
      </Tabs>

      <ConfirmationDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.title || deleteTarget?.reference}"?`}
        description="This draft will be removed from your posts. This can't be undone."
        confirmLabel="Delete"
        variant="destructive"
        isConfirming={deleting}
        onConfirm={confirmDelete}
      />

      <ConfirmationDialog
        open={!!submitTarget}
        onOpenChange={(open) => !open && setSubmitTarget(null)}
        title={`Submit "${submitTarget?.title || submitTarget?.reference}" for approval?`}
        description="An approver will be notified to review it."
        confirmLabel="Submit"
        isConfirming={submitting}
        onConfirm={confirmSubmit}
      />
    </div>
  );
}
