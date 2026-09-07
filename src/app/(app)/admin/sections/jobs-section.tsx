"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import type { ColumnDef } from "@tanstack/react-table";
import { ListChecks } from "lucide-react";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { ConfirmationDialog } from "@/components/app/confirmation-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  ApiError,
  CSRF_COOKIE_NAME,
  getJson,
  patchJson,
  postJson,
} from "@/lib/api-client";

type JobStatus =
  "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "DEAD" | "CANCELLED";

interface JobDto {
  id: string;
  type: string;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  scheduledAt: string;
  lastError: string | null;
}

interface JobScheduleDto {
  id: string;
  key: string;
  jobType: string;
  cronExpression: string;
  timezone: string;
  isEnabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

const STATUS_VARIANT: Record<
  JobStatus,
  "secondary" | "destructive" | "warning" | "success" | "default"
> = {
  PENDING: "secondary",
  RUNNING: "default",
  SUCCEEDED: "success",
  FAILED: "warning",
  DEAD: "destructive",
  CANCELLED: "secondary",
};

const STATUS_FILTERS: (JobStatus | "ALL")[] = [
  "ALL",
  "PENDING",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "DEAD",
  "CANCELLED",
];

export function JobsSection() {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<JobDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<JobStatus | "ALL">("ALL");

  const [schedules, setSchedules] = useState<JobScheduleDto[] | null>(null);
  const [schedulesError, setSchedulesError] = useState<string | null>(null);
  const [editSchedule, setEditSchedule] = useState<JobScheduleDto | null>(null);
  const [editCron, setEditCron] = useState("");
  const [editTimezone, setEditTimezone] = useState("");
  const [editEnabled, setEditEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  async function loadJobs(status: JobStatus | "ALL") {
    setError(null);
    try {
      const query = status === "ALL" ? "" : `&status=${status}`;
      const data = await getJson<JobDto[]>(
        `/api/v1/admin/jobs?pageSize=100${query}`,
      );
      setJobs(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  async function loadSchedules() {
    setSchedulesError(null);
    try {
      const data = await getJson<JobScheduleDto[]>(
        "/api/v1/admin/job-schedules",
      );
      setSchedules(data);
    } catch (err) {
      setSchedulesError(
        err instanceof ApiError ? err.message : "Couldn't load schedules.",
      );
    }
  }

  useEffect(() => {
    loadJobs(statusFilter);
    loadSchedules();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount; filter changes re-run via the Select handler below.
  }, []);

  async function handleRetry(job: JobDto) {
    try {
      await postJson(
        `/api/v1/admin/jobs/${job.id}/retry`,
        {},
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      toast({ title: "Job queued for retry." });
      await loadJobs(statusFilter);
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : "Couldn't retry job.",
        variant: "destructive",
      });
    }
  }

  async function handleCancel(job: JobDto) {
    try {
      await postJson(
        `/api/v1/admin/jobs/${job.id}/cancel`,
        {},
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      toast({ title: "Job cancelled." });
      await loadJobs(statusFilter);
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : "Couldn't cancel job.",
        variant: "destructive",
      });
    }
  }

  function openEditSchedule(schedule: JobScheduleDto) {
    setEditSchedule(schedule);
    setEditCron(schedule.cronExpression);
    setEditTimezone(schedule.timezone);
    setEditEnabled(schedule.isEnabled);
  }

  async function handleSaveSchedule() {
    if (!editSchedule) return;
    setIsSaving(true);
    try {
      const updated = await patchJson<JobScheduleDto>(
        `/api/v1/admin/job-schedules/${editSchedule.key}`,
        {
          cronExpression: editCron,
          timezone: editTimezone,
          isEnabled: editEnabled,
        },
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      toast({ title: "Schedule updated." });
      setSchedules((prev) =>
        prev ? prev.map((s) => (s.key === updated.key ? updated : s)) : prev,
      );
      setEditSchedule(null);
    } catch (err) {
      toast({
        title:
          err instanceof ApiError ? err.message : "Couldn't save schedule.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRunNow(schedule: JobScheduleDto) {
    try {
      await postJson(
        `/api/v1/admin/job-schedules/${schedule.key}/run-now`,
        {},
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      toast({ title: "Job enqueued." });
      await loadJobs(statusFilter);
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : "Couldn't enqueue job.",
        variant: "destructive",
      });
    }
  }

  const columns: ColumnDef<JobDto>[] = [
    { accessorKey: "type", header: "Type" },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANT[row.original.status]}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: "attempts",
      header: "Attempts",
      cell: ({ row }) => `${row.original.attempts}/${row.original.maxAttempts}`,
    },
    {
      accessorKey: "scheduledAt",
      header: "Scheduled for",
      cell: ({ row }) =>
        format(new Date(row.original.scheduledAt), "d MMM yyyy HH:mm"),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex gap-2">
          {(row.original.status === "DEAD" ||
            row.original.status === "FAILED") && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleRetry(row.original)}
            >
              Retry
            </Button>
          )}
          {row.original.status === "PENDING" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleCancel(row.original)}
            >
              Cancel
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Background jobs</h2>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              const next = v as JobStatus | "ALL";
              setStatusFilter(next);
              loadJobs(next);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === "ALL" ? "All statuses" : s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {error ? (
          <ErrorState message={error} onRetry={() => loadJobs(statusFilter)} />
        ) : !jobs ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : jobs.length === 0 ? (
          <EmptyState icon={ListChecks} title="No jobs match this filter." />
        ) : (
          <DataTable columns={columns} data={jobs} emptyMessage="No jobs." />
        )}
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Job schedules</h3>
        {schedulesError ? (
          <ErrorState message={schedulesError} onRetry={loadSchedules} />
        ) : schedules === null ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : schedules.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No job schedules configured.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job type</TableHead>
                  <TableHead>Cron</TableHead>
                  <TableHead>Timezone</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead>Next run</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((s) => (
                  <TableRow key={s.key}>
                    <TableCell>
                      <button
                        type="button"
                        className="font-medium hover:underline"
                        onClick={() => openEditSchedule(s)}
                      >
                        {s.jobType}
                      </button>
                    </TableCell>
                    <TableCell>{s.cronExpression}</TableCell>
                    <TableCell>{s.timezone}</TableCell>
                    <TableCell>
                      <Badge variant={s.isEnabled ? "success" : "secondary"}>
                        {s.isEnabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {s.nextRunAt
                        ? format(new Date(s.nextRunAt), "d MMM yyyy HH:mm")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleRunNow(s)}
                      >
                        Run now
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <ConfirmationDialog
        open={editSchedule !== null}
        onOpenChange={(open) => !open && setEditSchedule(null)}
        title={`Edit ${editSchedule?.jobType ?? ""} schedule`}
        description={
          <div className="space-y-3 text-left">
            <div className="space-y-1.5">
              <Label htmlFor="schedule-cron">Cron expression</Label>
              <Input
                id="schedule-cron"
                value={editCron}
                onChange={(e) => setEditCron(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="schedule-timezone">Timezone</Label>
              <Input
                id="schedule-timezone"
                value={editTimezone}
                onChange={(e) => setEditTimezone(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="schedule-enabled" className="font-normal">
                Enabled
              </Label>
              <Switch
                id="schedule-enabled"
                checked={editEnabled}
                onCheckedChange={setEditEnabled}
              />
            </div>
          </div>
        }
        confirmLabel="Save"
        isConfirming={isSaving}
        onConfirm={handleSaveSchedule}
      />
    </div>
  );
}
