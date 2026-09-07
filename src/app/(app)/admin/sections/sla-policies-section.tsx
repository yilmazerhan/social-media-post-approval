"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { ColumnDef } from "@tanstack/react-table";
import { Timer } from "lucide-react";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import {
  ApiError,
  CSRF_COOKIE_NAME,
  deleteJson,
  getJson,
  patchJson,
  postJson,
} from "@/lib/api-client";

type Priority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

interface SlaPolicyDto {
  id: string;
  name: string;
  priority: Priority | null;
  departmentId: string | null;
  durationMinutes: number;
  warningThresholdPercent: number;
  businessHoursOnly: boolean;
  isActive: boolean;
}

interface DepartmentOption {
  id: string;
  name: string;
}

const PRIORITIES: Priority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];

const policyFormSchema = z.object({
  name: z.string().min(1, "Required."),
  durationMinutes: z.number().int().min(1, "Must be at least 1."),
  warningThresholdPercent: z.number().int().min(1).max(100),
});
type PolicyFormValues = z.infer<typeof policyFormSchema>;

interface PolicyFormState {
  departmentId: string;
  priority: string;
  businessHoursOnly: boolean;
  isActive: boolean;
}

const EMPTY_STATE: PolicyFormState = {
  departmentId: "",
  priority: "",
  businessHoursOnly: false,
  isActive: true,
};

export function SlaPoliciesSection() {
  const { toast } = useToast();
  const [policies, setPolicies] = useState<SlaPolicyDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createState, setCreateState] = useState<PolicyFormState>(EMPTY_STATE);

  const [editPolicy, setEditPolicy] = useState<SlaPolicyDto | null>(null);
  const [editState, setEditState] = useState<PolicyFormState>(EMPTY_STATE);

  const [deleteTarget, setDeleteTarget] = useState<SlaPolicyDto | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function load() {
    setError(null);
    try {
      const data = await getJson<SlaPolicyDto[]>("/api/v1/admin/sla-policies");
      setPolicies(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  useEffect(() => {
    load();
    getJson<DepartmentOption[]>("/api/v1/departments")
      .then(setDepartments)
      .catch(() => setDepartments([]));
  }, []);

  const createForm = useForm<PolicyFormValues>({
    resolver: zodResolver(policyFormSchema),
    defaultValues: { warningThresholdPercent: 75 },
  });
  const editForm = useForm<PolicyFormValues>({
    resolver: zodResolver(policyFormSchema),
  });

  useEffect(() => {
    if (editPolicy) {
      editForm.reset({
        name: editPolicy.name,
        durationMinutes: editPolicy.durationMinutes,
        warningThresholdPercent: editPolicy.warningThresholdPercent,
      });
      setEditState({
        departmentId: editPolicy.departmentId ?? "",
        priority: editPolicy.priority ?? "",
        businessHoursOnly: editPolicy.businessHoursOnly,
        isActive: editPolicy.isActive,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editForm identity is stable.
  }, [editPolicy]);

  function buildPayload(values: PolicyFormValues, state: PolicyFormState) {
    return {
      name: values.name,
      durationMinutes: values.durationMinutes,
      warningThresholdPercent: values.warningThresholdPercent,
      departmentId: state.departmentId || null,
      priority: (state.priority || null) as Priority | null,
      businessHoursOnly: state.businessHoursOnly,
      isActive: state.isActive,
    };
  }

  async function onCreateSubmit(values: PolicyFormValues) {
    try {
      await postJson(
        "/api/v1/admin/sla-policies",
        buildPayload(values, createState),
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      toast({ title: "SLA policy created." });
      setCreateOpen(false);
      createForm.reset({ warningThresholdPercent: 75 });
      setCreateState(EMPTY_STATE);
      await load();
    } catch (err) {
      toast({
        title:
          err instanceof ApiError ? err.message : "Couldn't create policy.",
        variant: "destructive",
      });
    }
  }

  async function onEditSubmit(values: PolicyFormValues) {
    if (!editPolicy) return;
    try {
      const updated = await patchJson<SlaPolicyDto>(
        `/api/v1/admin/sla-policies/${editPolicy.id}`,
        buildPayload(values, editState),
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      toast({ title: "SLA policy updated." });
      setPolicies((prev) =>
        prev ? prev.map((p) => (p.id === updated.id ? updated : p)) : prev,
      );
      setEditPolicy(null);
    } catch (err) {
      toast({
        title:
          err instanceof ApiError ? err.message : "Couldn't update policy.",
        variant: "destructive",
      });
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsBusy(true);
    try {
      await deleteJson(`/api/v1/admin/sla-policies/${deleteTarget.id}`, {
        csrfCookieName: CSRF_COOKIE_NAME,
      });
      toast({ title: "SLA policy deleted." });
      setPolicies(
        (prev) => prev?.filter((p) => p.id !== deleteTarget.id) ?? null,
      );
      setDeleteTarget(null);
    } catch (err) {
      toast({
        title:
          err instanceof ApiError ? err.message : "Couldn't delete policy.",
        variant: "destructive",
      });
    } finally {
      setIsBusy(false);
    }
  }

  const columns: ColumnDef<SlaPolicyDto>[] = [
    {
      accessorKey: "name",
      header: "Policy",
      cell: ({ row }) => (
        <button
          type="button"
          className="font-medium hover:underline"
          onClick={() => setEditPolicy(row.original)}
        >
          {row.original.name}
        </button>
      ),
    },
    {
      accessorKey: "departmentId",
      header: "Department",
      cell: ({ row }) =>
        departments.find((d) => d.id === row.original.departmentId)?.name ??
        "Any",
    },
    {
      accessorKey: "priority",
      header: "Priority",
      cell: ({ row }) => row.original.priority ?? "Any",
    },
    {
      accessorKey: "durationMinutes",
      header: "Duration",
      cell: ({ row }) =>
        `${Math.round(row.original.durationMinutes / 60)}h ${row.original.durationMinutes % 60}m`,
    },
    {
      accessorKey: "warningThresholdPercent",
      header: "Warns at",
      cell: ({ row }) => `${row.original.warningThresholdPercent}%`,
    },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "success" : "secondary"}>
          {row.original.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setDeleteTarget(row.original)}
        >
          Delete
        </Button>
      ),
    },
  ];

  function PolicyFields({
    state,
    onChange,
  }: {
    state: PolicyFormState;
    onChange: (next: PolicyFormState) => void;
  }) {
    return (
      <>
        <div className="space-y-1.5">
          <Label>Department</Label>
          <Select
            value={state.departmentId || "any"}
            onValueChange={(v) =>
              onChange({ ...state, departmentId: v === "any" ? "" : v })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any department</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Priority</Label>
          <Select
            value={state.priority || "any"}
            onValueChange={(v) =>
              onChange({ ...state, priority: v === "any" ? "" : v })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any priority</SelectItem>
              {PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between">
          <Label className="font-normal">Business hours only</Label>
          <Switch
            checked={state.businessHoursOnly}
            onCheckedChange={(v) =>
              onChange({ ...state, businessHoursOnly: v })
            }
          />
        </div>
        <div className="flex items-center justify-between">
          <Label className="font-normal">Active</Label>
          <Switch
            checked={state.isActive}
            onCheckedChange={(v) => onChange({ ...state, isActive: v })}
          />
        </div>
      </>
    );
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!policies)
    return <p className="text-muted-foreground text-sm">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">SLA policies</h2>
        <Button
          onClick={() => {
            createForm.reset({ warningThresholdPercent: 75 });
            setCreateState(EMPTY_STATE);
            setCreateOpen(true);
          }}
        >
          New policy
        </Button>
      </div>

      {policies.length === 0 ? (
        <EmptyState icon={Timer} title="No SLA policies yet." />
      ) : (
        <DataTable
          columns={columns}
          data={policies}
          emptyMessage="No SLA policies."
        />
      )}

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>New SLA policy</SheetTitle>
          </SheetHeader>
          <form
            onSubmit={createForm.handleSubmit(onCreateSubmit)}
            className="space-y-4 px-4 pb-4"
            noValidate
          >
            <div className="space-y-1.5">
              <Label htmlFor="new-sla-name">Name</Label>
              <Input id="new-sla-name" {...createForm.register("name")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-sla-duration">Duration (minutes)</Label>
              <Input
                id="new-sla-duration"
                type="number"
                {...createForm.register("durationMinutes", {
                  valueAsNumber: true,
                })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-sla-warning">Warning threshold (%)</Label>
              <Input
                id="new-sla-warning"
                type="number"
                {...createForm.register("warningThresholdPercent", {
                  valueAsNumber: true,
                })}
              />
            </div>
            <PolicyFields state={createState} onChange={setCreateState} />
            <Button
              type="submit"
              className="w-full"
              disabled={createForm.formState.isSubmitting}
            >
              Create policy
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet
        open={editPolicy !== null}
        onOpenChange={(o) => !o && setEditPolicy(null)}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {editPolicy && (
            <>
              <SheetHeader>
                <SheetTitle>{editPolicy.name}</SheetTitle>
              </SheetHeader>
              <form
                onSubmit={editForm.handleSubmit(onEditSubmit)}
                className="space-y-4 px-4 pb-4"
                noValidate
              >
                <div className="space-y-1.5">
                  <Label htmlFor="edit-sla-name">Name</Label>
                  <Input id="edit-sla-name" {...editForm.register("name")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-sla-duration">Duration (minutes)</Label>
                  <Input
                    id="edit-sla-duration"
                    type="number"
                    {...editForm.register("durationMinutes", {
                      valueAsNumber: true,
                    })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-sla-warning">
                    Warning threshold (%)
                  </Label>
                  <Input
                    id="edit-sla-warning"
                    type="number"
                    {...editForm.register("warningThresholdPercent", {
                      valueAsNumber: true,
                    })}
                  />
                </div>
                <PolicyFields state={editState} onChange={setEditState} />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={editForm.formState.isSubmitting}
                >
                  Save changes
                </Button>
              </form>
            </>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmationDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this SLA policy?"
        description={`"${deleteTarget?.name}" will no longer apply to new submissions. This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        isConfirming={isBusy}
        onConfirm={handleDelete}
      />
    </div>
  );
}
