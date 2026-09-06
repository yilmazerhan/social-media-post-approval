"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { ColumnDef } from "@tanstack/react-table";
import { ShieldCheck } from "lucide-react";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import {
  ApiError,
  CSRF_COOKIE_NAME,
  getJson,
  patchJson,
  postJson,
} from "@/lib/api-client";

interface RoleDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissionKeys: string[];
}

interface PermissionEntry {
  key: string;
  category: string;
  description: string;
}

const createRoleFormSchema = z.object({
  key: z
    .string()
    .min(1, "Required.")
    .regex(
      /^[A-Z][A-Z0-9_]*$/,
      "Uppercase letters, digits and underscores only.",
    ),
  name: z.string().min(1, "Required."),
  description: z.string().optional(),
});
type CreateRoleFormValues = z.infer<typeof createRoleFormSchema>;

function groupByCategory(
  permissions: PermissionEntry[],
): Map<string, PermissionEntry[]> {
  const grouped = new Map<string, PermissionEntry[]>();
  for (const p of permissions) {
    const list = grouped.get(p.category) ?? [];
    list.push(p);
    grouped.set(p.category, list);
  }
  return grouped;
}

export function RolesSection() {
  const { toast } = useToast();
  const [roles, setRoles] = useState<RoleDto[] | null>(null);
  const [permissions, setPermissions] = useState<PermissionEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createPermissionKeys, setCreatePermissionKeys] = useState<Set<string>>(
    new Set(),
  );

  const [editRole, setEditRole] = useState<RoleDto | null>(null);
  const [editPermissionKeys, setEditPermissionKeys] = useState<Set<string>>(
    new Set(),
  );
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);

  async function load() {
    setError(null);
    try {
      const data = await getJson<RoleDto[]>("/api/v1/admin/roles");
      setRoles(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  useEffect(() => {
    load();
    getJson<PermissionEntry[]>("/api/v1/admin/permissions")
      .then(setPermissions)
      .catch(() => setPermissions([]));
  }, []);

  const grouped = useMemo(() => groupByCategory(permissions), [permissions]);

  const createForm = useForm<CreateRoleFormValues>({
    resolver: zodResolver(createRoleFormSchema),
  });

  async function onCreateSubmit(values: CreateRoleFormValues) {
    try {
      await postJson(
        "/api/v1/admin/roles",
        {
          key: values.key,
          name: values.name,
          description: values.description || undefined,
          permissionKeys: Array.from(createPermissionKeys),
        },
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      toast({ title: "Role created." });
      setCreateOpen(false);
      createForm.reset();
      setCreatePermissionKeys(new Set());
      await load();
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : "Couldn't create role.",
        variant: "destructive",
      });
    }
  }

  function openEdit(role: RoleDto) {
    setEditRole(role);
    setEditPermissionKeys(new Set(role.permissionKeys));
  }

  async function handleSavePermissions() {
    if (!editRole) return;
    setIsSavingPermissions(true);
    try {
      const updated = await patchJson<RoleDto>(
        `/api/v1/admin/roles/${editRole.id}`,
        { permissionKeys: Array.from(editPermissionKeys) },
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      toast({ title: "Permissions updated." });
      setRoles((prev) =>
        prev ? prev.map((r) => (r.id === updated.id ? updated : r)) : prev,
      );
      setEditRole(updated);
    } catch (err) {
      toast({
        title:
          err instanceof ApiError ? err.message : "Couldn't save permissions.",
        variant: "destructive",
      });
    } finally {
      setIsSavingPermissions(false);
    }
  }

  const columns: ColumnDef<RoleDto>[] = [
    {
      accessorKey: "name",
      header: "Role",
      cell: ({ row }) => (
        <button
          type="button"
          className="font-medium hover:underline"
          onClick={() => openEdit(row.original)}
        >
          {row.original.name}
        </button>
      ),
    },
    { accessorKey: "key", header: "Key" },
    {
      accessorKey: "isSystem",
      header: "Type",
      cell: ({ row }) => (
        <Badge variant={row.original.isSystem ? "secondary" : "outline"}>
          {row.original.isSystem ? "System" : "Custom"}
        </Badge>
      ),
    },
    {
      accessorKey: "permissionKeys",
      header: "Permissions",
      cell: ({ row }) => row.original.permissionKeys.length,
    },
  ];

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!roles) return <p className="text-muted-foreground text-sm">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Roles</h2>
        <Button
          onClick={() => {
            createForm.reset();
            setCreatePermissionKeys(new Set());
            setCreateOpen(true);
          }}
        >
          New role
        </Button>
      </div>

      {roles.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No roles yet." />
      ) : (
        <DataTable columns={columns} data={roles} emptyMessage="No roles." />
      )}

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>New role</SheetTitle>
            <SheetDescription>
              Grant only what this role needs.
            </SheetDescription>
          </SheetHeader>
          <form
            onSubmit={createForm.handleSubmit(onCreateSubmit)}
            className="space-y-4 px-4 pb-4"
            noValidate
          >
            <div className="space-y-1.5">
              <Label htmlFor="new-role-key">Key</Label>
              <Input
                id="new-role-key"
                placeholder="CONTENT_REVIEWER"
                aria-invalid={!!createForm.formState.errors.key}
                {...createForm.register("key")}
              />
              {createForm.formState.errors.key && (
                <p className="text-destructive text-sm">
                  {createForm.formState.errors.key.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-role-name">Name</Label>
              <Input
                id="new-role-name"
                aria-invalid={!!createForm.formState.errors.name}
                {...createForm.register("name")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-role-description">Description</Label>
              <Textarea
                id="new-role-description"
                {...createForm.register("description")}
              />
            </div>
            <div className="space-y-3">
              <Label>Permissions</Label>
              {Array.from(grouped.entries()).map(([category, entries]) => (
                <div
                  key={category}
                  className="space-y-1.5 rounded-md border p-3"
                >
                  <p className="text-xs font-semibold uppercase">{category}</p>
                  {entries.map((p) => (
                    <div key={p.key} className="flex items-center gap-2">
                      <Checkbox
                        id={`create-perm-${p.key}`}
                        checked={createPermissionKeys.has(p.key)}
                        onCheckedChange={(checked) =>
                          setCreatePermissionKeys((prev) => {
                            const next = new Set(prev);
                            if (checked) next.add(p.key);
                            else next.delete(p.key);
                            return next;
                          })
                        }
                      />
                      <Label
                        htmlFor={`create-perm-${p.key}`}
                        className="font-normal"
                      >
                        {p.description}
                      </Label>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={createForm.formState.isSubmitting}
            >
              Create role
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet
        open={editRole !== null}
        onOpenChange={(o) => !o && setEditRole(null)}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {editRole && (
            <>
              <SheetHeader>
                <SheetTitle>{editRole.name}</SheetTitle>
                <SheetDescription>
                  {editRole.isSystem
                    ? "A system role — its permission grants can be extended."
                    : "Edit this role's permission grants."}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-4">
                <div className="space-y-3">
                  {Array.from(grouped.entries()).map(([category, entries]) => (
                    <div
                      key={category}
                      className="space-y-1.5 rounded-md border p-3"
                    >
                      <p className="text-xs font-semibold uppercase">
                        {category}
                      </p>
                      {entries.map((p) => (
                        <div key={p.key} className="flex items-center gap-2">
                          <Checkbox
                            id={`edit-perm-${p.key}`}
                            checked={editPermissionKeys.has(p.key)}
                            onCheckedChange={(checked) =>
                              setEditPermissionKeys((prev) => {
                                const next = new Set(prev);
                                if (checked) next.add(p.key);
                                else next.delete(p.key);
                                return next;
                              })
                            }
                          />
                          <Label
                            htmlFor={`edit-perm-${p.key}`}
                            className="font-normal"
                          >
                            {p.description}
                          </Label>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  className="w-full"
                  disabled={isSavingPermissions}
                  onClick={handleSavePermissions}
                >
                  Save permissions
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
