"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { ColumnDef } from "@tanstack/react-table";
import { Route } from "lucide-react";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { ConfirmationDialog } from "@/components/app/confirmation-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
import { UserPicker, type UserOption } from "../user-picker";

type Priority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
type TargetType = "USER" | "GROUP" | "DEPARTMENT_MANAGER";

interface ApprovalRuleDto {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  priorityOrder: number;
  departmentId: string | null;
  priority: Priority | null;
  creatorGroupId: string | null;
  targetType: TargetType;
  targetUserId: string | null;
  targetGroupId: string | null;
  slaPolicyId: string | null;
  allowCreatorOverride: boolean;
}

interface DepartmentOption {
  id: string;
  name: string;
}
interface GroupOption {
  id: string;
  name: string;
}
interface SlaPolicyOption {
  id: string;
  name: string;
}

const PRIORITIES: Priority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];

const ruleFormSchema = z.object({
  name: z.string().min(1, "Required."),
  description: z.string().optional(),
  priorityOrder: z.number().int().min(0),
});
type RuleFormValues = z.infer<typeof ruleFormSchema>;

interface RuleFormState {
  isActive: boolean;
  departmentId: string;
  priority: string;
  targetType: TargetType;
  targetUserId: string;
  targetUserName: string;
  targetGroupId: string;
  slaPolicyId: string;
  allowCreatorOverride: boolean;
}

const EMPTY_FORM_STATE: RuleFormState = {
  isActive: true,
  departmentId: "",
  priority: "",
  targetType: "USER",
  targetUserId: "",
  targetUserName: "",
  targetGroupId: "",
  slaPolicyId: "",
  allowCreatorOverride: false,
};

interface RoutePreviewResult {
  rule: { id: string; name: string; priorityOrder: number } | null;
  assigneeName: string | null;
}

export function ApprovalRulesSection() {
  const { toast } = useToast();
  const [rules, setRules] = useState<ApprovalRuleDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [slaPolicies, setSlaPolicies] = useState<SlaPolicyOption[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createState, setCreateState] =
    useState<RuleFormState>(EMPTY_FORM_STATE);

  const [editRule, setEditRule] = useState<ApprovalRuleDto | null>(null);
  const [editState, setEditState] = useState<RuleFormState>(EMPTY_FORM_STATE);

  const [deleteTarget, setDeleteTarget] = useState<ApprovalRuleDto | null>(
    null,
  );
  const [isBusy, setIsBusy] = useState(false);

  const [previewCreator, setPreviewCreator] = useState<UserOption | null>(null);
  const [previewDepartmentId, setPreviewDepartmentId] = useState("");
  const [previewPriority, setPreviewPriority] = useState<Priority>("NORMAL");
  const [previewResult, setPreviewResult] = useState<RoutePreviewResult | null>(
    null,
  );
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  async function load() {
    setError(null);
    try {
      const data = await getJson<ApprovalRuleDto[]>(
        "/api/v1/admin/approval-rules",
      );
      setRules(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  useEffect(() => {
    load();
    getJson<DepartmentOption[]>("/api/v1/departments")
      .then(setDepartments)
      .catch(() => setDepartments([]));
    getJson<GroupOption[]>("/api/v1/groups")
      .then(setGroups)
      .catch(() => setGroups([]));
    getJson<SlaPolicyOption[]>("/api/v1/admin/sla-policies")
      .then(setSlaPolicies)
      .catch(() => setSlaPolicies([]));
  }, []);

  const createForm = useForm<RuleFormValues>({
    resolver: zodResolver(ruleFormSchema),
    defaultValues: { priorityOrder: 0 },
  });
  const editForm = useForm<RuleFormValues>({
    resolver: zodResolver(ruleFormSchema),
  });

  useEffect(() => {
    if (editRule) {
      editForm.reset({
        name: editRule.name,
        description: editRule.description ?? "",
        priorityOrder: editRule.priorityOrder,
      });
      setEditState({
        isActive: editRule.isActive,
        departmentId: editRule.departmentId ?? "",
        priority: editRule.priority ?? "",
        targetType: editRule.targetType,
        targetUserId: editRule.targetUserId ?? "",
        targetUserName: "",
        targetGroupId: editRule.targetGroupId ?? "",
        slaPolicyId: editRule.slaPolicyId ?? "",
        allowCreatorOverride: editRule.allowCreatorOverride,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editForm identity is stable.
  }, [editRule]);

  function buildPayload(values: RuleFormValues, state: RuleFormState) {
    return {
      name: values.name,
      description: values.description || undefined,
      isActive: state.isActive,
      priorityOrder: values.priorityOrder,
      departmentId: state.departmentId || null,
      priority: (state.priority || null) as Priority | null,
      targetType: state.targetType,
      targetUserId:
        state.targetType === "USER" ? state.targetUserId || null : null,
      targetGroupId:
        state.targetType === "GROUP" ? state.targetGroupId || null : null,
      slaPolicyId: state.slaPolicyId || null,
      allowCreatorOverride: state.allowCreatorOverride,
    };
  }

  async function onCreateSubmit(values: RuleFormValues) {
    try {
      await postJson(
        "/api/v1/admin/approval-rules",
        buildPayload(values, createState),
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      toast({ title: "Approval rule created." });
      setCreateOpen(false);
      createForm.reset({ priorityOrder: 0 });
      setCreateState(EMPTY_FORM_STATE);
      await load();
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : "Couldn't create rule.",
        variant: "destructive",
      });
    }
  }

  async function onEditSubmit(values: RuleFormValues) {
    if (!editRule) return;
    try {
      const updated = await patchJson<ApprovalRuleDto>(
        `/api/v1/admin/approval-rules/${editRule.id}`,
        buildPayload(values, editState),
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      toast({ title: "Approval rule updated." });
      setRules((prev) =>
        prev ? prev.map((r) => (r.id === updated.id ? updated : r)) : prev,
      );
      setEditRule(null);
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : "Couldn't update rule.",
        variant: "destructive",
      });
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsBusy(true);
    try {
      await deleteJson(`/api/v1/admin/approval-rules/${deleteTarget.id}`, {
        csrfCookieName: CSRF_COOKIE_NAME,
      });
      toast({ title: "Approval rule deleted." });
      setRules((prev) => prev?.filter((r) => r.id !== deleteTarget.id) ?? null);
      setDeleteTarget(null);
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : "Couldn't delete rule.",
        variant: "destructive",
      });
    } finally {
      setIsBusy(false);
    }
  }

  async function handlePreview() {
    if (!previewCreator) return;
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewResult(null);
    try {
      const result = await postJson<RoutePreviewResult>(
        "/api/v1/admin/approval-rules/preview",
        {
          departmentId: previewDepartmentId || null,
          priority: previewPriority,
          creatorId: previewCreator.id,
        },
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      setPreviewResult(result);
    } catch (err) {
      setPreviewError(
        err instanceof ApiError ? err.message : "Couldn't run the preview.",
      );
    } finally {
      setPreviewLoading(false);
    }
  }

  function targetLabel(rule: ApprovalRuleDto): string {
    if (rule.targetType === "DEPARTMENT_MANAGER") return "Department manager";
    if (rule.targetType === "GROUP") {
      return groups.find((g) => g.id === rule.targetGroupId)?.name ?? "Group";
    }
    return "User";
  }

  const columns: ColumnDef<ApprovalRuleDto>[] = [
    { accessorKey: "priorityOrder", header: "Order" },
    {
      accessorKey: "name",
      header: "Rule",
      cell: ({ row }) => (
        <button
          type="button"
          className="font-medium hover:underline"
          onClick={() => setEditRule(row.original)}
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
      accessorKey: "targetType",
      header: "Target",
      cell: ({ row }) => targetLabel(row.original),
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

  function RuleFields({
    state,
    onChange,
  }: {
    state: RuleFormState;
    onChange: (next: RuleFormState) => void;
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
        <div className="space-y-1.5">
          <Label>Target type</Label>
          <Select
            value={state.targetType}
            onValueChange={(v) =>
              onChange({ ...state, targetType: v as TargetType })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="USER">Specific user</SelectItem>
              <SelectItem value="GROUP">Group</SelectItem>
              <SelectItem value="DEPARTMENT_MANAGER">
                Department manager
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        {state.targetType === "USER" && (
          <div className="space-y-1.5">
            <Label>Target user</Label>
            {state.targetUserId ? (
              <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span>{state.targetUserName || state.targetUserId}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    onChange({ ...state, targetUserId: "", targetUserName: "" })
                  }
                >
                  Clear
                </Button>
              </div>
            ) : (
              <UserPicker
                onSelect={(u) =>
                  onChange({
                    ...state,
                    targetUserId: u.id,
                    targetUserName: u.displayName,
                  })
                }
              />
            )}
          </div>
        )}
        {state.targetType === "GROUP" && (
          <div className="space-y-1.5">
            <Label>Target group</Label>
            <Select
              value={state.targetGroupId}
              onValueChange={(v) => onChange({ ...state, targetGroupId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a group" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label>SLA policy</Label>
          <Select
            value={state.slaPolicyId || "none"}
            onValueChange={(v) =>
              onChange({ ...state, slaPolicyId: v === "none" ? "" : v })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {slaPolicies.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between">
          <Label className="font-normal">Allow creator override</Label>
          <Switch
            checked={state.allowCreatorOverride}
            onCheckedChange={(v) =>
              onChange({ ...state, allowCreatorOverride: v })
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
  if (!rules) return <p className="text-muted-foreground text-sm">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Approval rules</h2>
          <Button
            onClick={() => {
              createForm.reset({ priorityOrder: rules.length });
              setCreateState(EMPTY_FORM_STATE);
              setCreateOpen(true);
            }}
          >
            New rule
          </Button>
        </div>

        {rules.length === 0 ? (
          <EmptyState icon={Route} title="No approval rules yet." />
        ) : (
          <DataTable columns={columns} data={rules} emptyMessage="No rules." />
        )}
      </div>

      <div className="space-y-3 rounded-md border p-4">
        <h3 className="text-sm font-semibold">Test this rule</h3>
        <p className="text-muted-foreground text-sm">
          See which route a hypothetical post would take.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Department</Label>
            <Select
              value={previewDepartmentId || "any"}
              onValueChange={(v) =>
                setPreviewDepartmentId(v === "any" ? "" : v)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">No department</SelectItem>
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
              value={previewPriority}
              onValueChange={(v) => setPreviewPriority(v as Priority)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Creator</Label>
          {previewCreator ? (
            <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>{previewCreator.displayName}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPreviewCreator(null)}
              >
                Clear
              </Button>
            </div>
          ) : (
            <UserPicker onSelect={setPreviewCreator} />
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!previewCreator || previewLoading}
          onClick={handlePreview}
        >
          Run preview
        </Button>
        {previewError && (
          <p className="text-destructive text-sm">{previewError}</p>
        )}
        {previewResult && (
          <p className="text-sm">
            {previewResult.rule
              ? `Matched rule "${previewResult.rule.name}" — assigned to ${previewResult.assigneeName ?? "an unresolved assignee"}.`
              : "No rule matched — the catch-all rule would apply."}
          </p>
        )}
      </div>

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>New approval rule</SheetTitle>
          </SheetHeader>
          <form
            onSubmit={createForm.handleSubmit(onCreateSubmit)}
            className="space-y-4 px-4 pb-4"
            noValidate
          >
            <div className="space-y-1.5">
              <Label htmlFor="new-rule-name">Name</Label>
              <Input id="new-rule-name" {...createForm.register("name")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-rule-description">Description</Label>
              <Textarea
                id="new-rule-description"
                {...createForm.register("description")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-rule-order">Priority order</Label>
              <Input
                id="new-rule-order"
                type="number"
                {...createForm.register("priorityOrder", {
                  valueAsNumber: true,
                })}
              />
            </div>
            <RuleFields state={createState} onChange={setCreateState} />
            <Button
              type="submit"
              className="w-full"
              disabled={createForm.formState.isSubmitting}
            >
              Create rule
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet
        open={editRule !== null}
        onOpenChange={(o) => !o && setEditRule(null)}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {editRule && (
            <>
              <SheetHeader>
                <SheetTitle>{editRule.name}</SheetTitle>
              </SheetHeader>
              <form
                onSubmit={editForm.handleSubmit(onEditSubmit)}
                className="space-y-4 px-4 pb-4"
                noValidate
              >
                <div className="space-y-1.5">
                  <Label htmlFor="edit-rule-name">Name</Label>
                  <Input id="edit-rule-name" {...editForm.register("name")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-rule-description">Description</Label>
                  <Textarea
                    id="edit-rule-description"
                    {...editForm.register("description")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-rule-order">Priority order</Label>
                  <Input
                    id="edit-rule-order"
                    type="number"
                    {...editForm.register("priorityOrder", {
                      valueAsNumber: true,
                    })}
                  />
                </div>
                <RuleFields state={editState} onChange={setEditState} />
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
        title="Delete this approval rule?"
        description={`"${deleteTarget?.name}" will no longer be matched. This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        isConfirming={isBusy}
        onConfirm={handleDelete}
      />
    </div>
  );
}
