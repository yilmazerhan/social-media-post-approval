"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2 } from "lucide-react";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  getJson,
  patchJson,
  postJson,
} from "@/lib/api-client";
import { UserPicker, type UserOption } from "../user-picker";

interface DepartmentDto {
  id: string;
  key: string;
  name: string;
  managerId: string | null;
  managerName: string | null;
  parentId: string | null;
  isActive: boolean;
}

const departmentFormSchema = z.object({
  key: z.string().min(1, "Required."),
  name: z.string().min(1, "Required."),
});
type DepartmentFormValues = z.infer<typeof departmentFormSchema>;

export function DepartmentsSection() {
  const { toast } = useToast();
  const [departments, setDepartments] = useState<DepartmentDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createManager, setCreateManager] = useState<UserOption | null>(null);
  const [createIsActive, setCreateIsActive] = useState(true);

  const [editDepartment, setEditDepartment] = useState<DepartmentDto | null>(
    null,
  );
  const [editManager, setEditManager] = useState<UserOption | null>(null);
  const [editIsActive, setEditIsActive] = useState(true);

  async function load() {
    setError(null);
    try {
      const data = await getJson<DepartmentDto[]>("/api/v1/departments");
      setDepartments(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const createForm = useForm<DepartmentFormValues>({
    resolver: zodResolver(departmentFormSchema),
  });
  const editForm = useForm<DepartmentFormValues>({
    resolver: zodResolver(departmentFormSchema),
  });

  useEffect(() => {
    if (editDepartment) {
      editForm.reset({ key: editDepartment.key, name: editDepartment.name });
      setEditManager(
        editDepartment.managerId && editDepartment.managerName
          ? {
              id: editDepartment.managerId,
              displayName: editDepartment.managerName,
              email: "",
            }
          : null,
      );
      setEditIsActive(editDepartment.isActive);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editForm identity is stable.
  }, [editDepartment]);

  async function onCreateSubmit(values: DepartmentFormValues) {
    try {
      await postJson(
        "/api/v1/departments",
        {
          key: values.key,
          name: values.name,
          managerId: createManager?.id ?? null,
          isActive: createIsActive,
        },
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      toast({ title: "Department created." });
      setCreateOpen(false);
      createForm.reset();
      setCreateManager(null);
      setCreateIsActive(true);
      await load();
    } catch (err) {
      toast({
        title:
          err instanceof ApiError ? err.message : "Couldn't create department.",
        variant: "destructive",
      });
    }
  }

  async function onEditSubmit(values: DepartmentFormValues) {
    if (!editDepartment) return;
    try {
      const updated = await patchJson<DepartmentDto>(
        `/api/v1/departments/${editDepartment.id}`,
        {
          key: values.key,
          name: values.name,
          managerId: editManager?.id ?? null,
          isActive: editIsActive,
        },
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      toast({ title: "Department updated." });
      setDepartments((prev) =>
        prev ? prev.map((d) => (d.id === updated.id ? updated : d)) : prev,
      );
      setEditDepartment(null);
    } catch (err) {
      toast({
        title:
          err instanceof ApiError ? err.message : "Couldn't update department.",
        variant: "destructive",
      });
    }
  }

  const columns: ColumnDef<DepartmentDto>[] = [
    {
      accessorKey: "name",
      header: "Department",
      cell: ({ row }) => (
        <button
          type="button"
          className="font-medium hover:underline"
          onClick={() => setEditDepartment(row.original)}
        >
          {row.original.name}
        </button>
      ),
    },
    { accessorKey: "key", header: "Key" },
    {
      accessorKey: "managerName",
      header: "Manager",
      cell: ({ row }) => row.original.managerName ?? "—",
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
  ];

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!departments)
    return <p className="text-muted-foreground text-sm">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Departments</h2>
        <Button
          onClick={() => {
            createForm.reset();
            setCreateManager(null);
            setCreateIsActive(true);
            setCreateOpen(true);
          }}
        >
          New department
        </Button>
      </div>

      {departments.length === 0 ? (
        <EmptyState icon={Building2} title="No departments yet." />
      ) : (
        <DataTable
          columns={columns}
          data={departments}
          emptyMessage="No departments."
        />
      )}

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>New department</SheetTitle>
          </SheetHeader>
          <form
            onSubmit={createForm.handleSubmit(onCreateSubmit)}
            className="space-y-4 px-4 pb-4"
            noValidate
          >
            <div className="space-y-1.5">
              <Label htmlFor="new-dept-key">Key</Label>
              <Input id="new-dept-key" {...createForm.register("key")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-dept-name">Name</Label>
              <Input id="new-dept-name" {...createForm.register("name")} />
            </div>
            <div className="space-y-1.5">
              <Label>Manager</Label>
              {createManager ? (
                <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span>{createManager.displayName}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setCreateManager(null)}
                  >
                    Clear
                  </Button>
                </div>
              ) : (
                <UserPicker onSelect={setCreateManager} />
              )}
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="new-dept-active" className="font-normal">
                Active
              </Label>
              <Switch
                id="new-dept-active"
                checked={createIsActive}
                onCheckedChange={setCreateIsActive}
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={createForm.formState.isSubmitting}
            >
              Create department
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet
        open={editDepartment !== null}
        onOpenChange={(o) => !o && setEditDepartment(null)}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {editDepartment && (
            <>
              <SheetHeader>
                <SheetTitle>{editDepartment.name}</SheetTitle>
              </SheetHeader>
              <form
                onSubmit={editForm.handleSubmit(onEditSubmit)}
                className="space-y-4 px-4 pb-4"
                noValidate
              >
                <div className="space-y-1.5">
                  <Label htmlFor="edit-dept-key">Key</Label>
                  <Input id="edit-dept-key" {...editForm.register("key")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-dept-name">Name</Label>
                  <Input id="edit-dept-name" {...editForm.register("name")} />
                </div>
                <div className="space-y-1.5">
                  <Label>Manager</Label>
                  {editManager ? (
                    <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                      <span>{editManager.displayName}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditManager(null)}
                      >
                        Clear
                      </Button>
                    </div>
                  ) : (
                    <UserPicker onSelect={setEditManager} />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="edit-dept-active" className="font-normal">
                    Active
                  </Label>
                  <Switch
                    id="edit-dept-active"
                    checked={editIsActive}
                    onCheckedChange={setEditIsActive}
                  />
                </div>
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
    </div>
  );
}
