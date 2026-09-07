"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Trash } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { ConfirmationDialog } from "@/components/app/confirmation-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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

type RetentionTarget =
  | "POST"
  | "ATTACHMENT"
  | "COMMENT"
  | "NOTIFICATION"
  | "EMAIL_LOG"
  | "AUDIT_LOG"
  | "BACKGROUND_JOB"
  | "SESSION";

interface RetentionPolicyDto {
  id: string;
  target: RetentionTarget;
  retentionDays: number;
  isEnabled: boolean;
  dryRun: boolean;
  lastRunAt: string | null;
  description: string | null;
}

interface RetentionRunDto {
  id: string;
  target: RetentionTarget;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string | null;
  candidateCount: number;
  deletedCount: number;
  skippedCount: number;
  error: string | null;
}

interface RunResult {
  candidateCount: number;
  deletedCount: number;
  skippedCount: number;
}

export function RetentionSection() {
  const { toast } = useToast();
  const [policies, setPolicies] = useState<RetentionPolicyDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<RetentionRunDto[] | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<RetentionPolicyDto | null>(null);
  const [editDays, setEditDays] = useState("");
  const [editEnabled, setEditEnabled] = useState(true);
  const [editDryRun, setEditDryRun] = useState(true);
  const [editDescription, setEditDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [runTarget, setRunTarget] = useState<RetentionPolicyDto | null>(null);
  const [runDryRun, setRunDryRun] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [confirmRealRun, setConfirmRealRun] = useState(false);

  async function load() {
    setError(null);
    try {
      const data = await getJson<RetentionPolicyDto[]>(
        "/api/v1/admin/retention-policies",
      );
      setPolicies(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  async function loadRuns() {
    setRunsError(null);
    try {
      const data = await getJson<RetentionRunDto[]>(
        "/api/v1/admin/retention/runs?pageSize=20",
      );
      setRuns(data);
    } catch (err) {
      setRunsError(
        err instanceof ApiError ? err.message : "Couldn't load run history.",
      );
    }
  }

  useEffect(() => {
    load();
    loadRuns();
  }, []);

  function openEdit(policy: RetentionPolicyDto) {
    setEditTarget(policy);
    setEditDays(String(policy.retentionDays));
    setEditEnabled(policy.isEnabled);
    setEditDryRun(policy.dryRun);
    setEditDescription(policy.description ?? "");
  }

  async function handleSave() {
    if (!editTarget) return;
    setIsSaving(true);
    try {
      const updated = await patchJson<RetentionPolicyDto>(
        `/api/v1/admin/retention-policies/${editTarget.target}`,
        {
          retentionDays: Number(editDays),
          isEnabled: editEnabled,
          dryRun: editDryRun,
          description: editDescription || undefined,
        },
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      toast({ title: "Retention policy updated." });
      setPolicies((prev) =>
        prev
          ? prev.map((p) => (p.target === updated.target ? updated : p))
          : prev,
      );
      setEditTarget(null);
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : "Couldn't save policy.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }

  function openRun(policy: RetentionPolicyDto) {
    setRunTarget(policy);
    setRunDryRun(true);
    setConfirmRealRun(false);
  }

  async function handleRun() {
    if (!runTarget) return;
    if (!runDryRun && !confirmRealRun) {
      setConfirmRealRun(true);
      return;
    }
    setIsRunning(true);
    try {
      const result = await postJson<RunResult>(
        "/api/v1/admin/retention/run",
        { target: runTarget.target, dryRun: runDryRun },
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      toast({
        title: runDryRun
          ? `Dry run: ${result.candidateCount} candidate(s) found.`
          : `Deleted ${result.deletedCount} of ${result.candidateCount} candidate(s).`,
      });
      setRunTarget(null);
      await Promise.all([load(), loadRuns()]);
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : "The run failed.",
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!policies)
    return <p className="text-muted-foreground text-sm">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Retention</h2>
        {policies.length === 0 ? (
          <EmptyState icon={Trash} title="No retention policies configured." />
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Target</TableHead>
                  <TableHead>Retention</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead>Dry run</TableHead>
                  <TableHead>Last run</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.map((p) => (
                  <TableRow key={p.target}>
                    <TableCell>
                      <button
                        type="button"
                        className="font-medium hover:underline"
                        onClick={() => openEdit(p)}
                      >
                        {p.target}
                      </button>
                    </TableCell>
                    <TableCell>{p.retentionDays} days</TableCell>
                    <TableCell>
                      <Badge variant={p.isEnabled ? "success" : "secondary"}>
                        {p.isEnabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.dryRun ? "warning" : "outline"}>
                        {p.dryRun ? "Dry run" : "Live"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {p.lastRunAt
                        ? format(new Date(p.lastRunAt), "d MMM yyyy HH:mm")
                        : "Never"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openRun(p)}
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

      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Recent runs</h3>
        {runsError ? (
          <ErrorState message={runsError} onRetry={loadRuns} />
        ) : runs === null ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : runs.length === 0 ? (
          <p className="text-muted-foreground text-sm">No runs yet.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Target</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Candidates</TableHead>
                  <TableHead>Deleted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.target}</TableCell>
                    <TableCell>{r.dryRun ? "Dry run" : "Live"}</TableCell>
                    <TableCell>
                      {format(new Date(r.startedAt), "d MMM yyyy HH:mm")}
                    </TableCell>
                    <TableCell>{r.candidateCount}</TableCell>
                    <TableCell>{r.deletedCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Edit policy */}
      <ConfirmationDialog
        open={editTarget !== null}
        onOpenChange={(open) => !open && setEditTarget(null)}
        title={`Edit ${editTarget?.target ?? ""} retention`}
        description={
          <div className="space-y-3 text-left">
            <div className="space-y-1.5">
              <Label htmlFor="retention-days">Retention (days)</Label>
              <Input
                id="retention-days"
                type="number"
                value={editDays}
                onChange={(e) => setEditDays(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="retention-description">Description</Label>
              <Input
                id="retention-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="retention-enabled" className="font-normal">
                Enabled
              </Label>
              <Switch
                id="retention-enabled"
                checked={editEnabled}
                onCheckedChange={setEditEnabled}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="retention-dry-run" className="font-normal">
                Dry run by default
              </Label>
              <Switch
                id="retention-dry-run"
                checked={editDryRun}
                onCheckedChange={setEditDryRun}
              />
            </div>
          </div>
        }
        confirmLabel="Save"
        isConfirming={isSaving}
        onConfirm={handleSave}
      />

      {/* Run now */}
      <ConfirmationDialog
        open={runTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRunTarget(null);
            setConfirmRealRun(false);
          }
        }}
        title={`Run retention for ${runTarget?.target ?? ""}?`}
        description={
          confirmRealRun ? (
            <p>
              This will permanently delete the matching rows. This cannot be
              undone.
            </p>
          ) : (
            <div className="space-y-3 text-left">
              <p>
                A dry run shows what would be deleted without deleting anything.
              </p>
              <div className="flex items-center justify-between">
                <Label htmlFor="run-dry-run" className="font-normal">
                  Dry run
                </Label>
                <Switch
                  id="run-dry-run"
                  checked={runDryRun}
                  onCheckedChange={setRunDryRun}
                />
              </div>
            </div>
          )
        }
        confirmLabel={
          confirmRealRun ? "Delete permanently" : runDryRun ? "Run" : "Continue"
        }
        variant={runDryRun && !confirmRealRun ? "default" : "destructive"}
        isConfirming={isRunning}
        onConfirm={handleRun}
      />
    </div>
  );
}
