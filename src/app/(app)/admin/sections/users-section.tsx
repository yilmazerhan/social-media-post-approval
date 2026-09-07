"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { KeyRound, Users as UsersIcon } from "lucide-react";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { ConfirmationDialog } from "@/components/app/confirmation-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ApiError,
  CSRF_COOKIE_NAME,
  deleteJson,
  getJson,
  patchJson,
  postJson,
} from "@/lib/api-client";

type UserStatus = "ACTIVE" | "DISABLED" | "LOCKED" | "PENDING";

interface UserRow {
  id: string;
  email: string;
  displayName: string;
  jobTitle: string | null;
  departmentId: string | null;
  departmentName: string | null;
  status: UserStatus;
  authProvider: "LOCAL" | "ENTRA_ID";
  roleKeys: string[];
  lastLoginAt: string | null;
}

interface DepartmentOption {
  id: string;
  name: string;
}

interface RoleOption {
  key: string;
  name: string;
}

interface SessionRow {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  authProvider: string;
}

const STATUS_VARIANT: Record<
  UserStatus,
  "secondary" | "destructive" | "warning" | "success"
> = {
  ACTIVE: "success",
  DISABLED: "secondary",
  LOCKED: "destructive",
  PENDING: "warning",
};

const createUserFormSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  displayName: z.string().min(1, "Required."),
  firstName: z.string().min(1, "Required."),
  lastName: z.string().min(1, "Required."),
  jobTitle: z.string().optional(),
  departmentId: z.string().optional(),
});
type CreateUserFormValues = z.infer<typeof createUserFormSchema>;

const editUserFormSchema = z.object({
  displayName: z.string().min(1, "Required."),
  jobTitle: z.string().optional(),
  departmentId: z.string().optional(),
});
type EditUserFormValues = z.infer<typeof editUserFormSchema>;

export function UsersSection({ canManage }: { canManage: boolean }) {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedRoleKeys, setSelectedRoleKeys] = useState<Set<string>>(
    new Set(),
  );

  const [detailUser, setDetailUser] = useState<UserRow | null>(null);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [addRoleKey, setAddRoleKey] = useState("");

  const [enableTarget, setEnableTarget] = useState<{
    user: UserRow;
    enable: boolean;
  } | null>(null);
  const [revokeSessionsTarget, setRevokeSessionsTarget] =
    useState<UserRow | null>(null);
  const [resetPasswordTarget, setResetPasswordTarget] =
    useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  async function load() {
    setError(null);
    try {
      const data = await getJson<UserRow[]>("/api/v1/users?pageSize=200");
      setUsers(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  useEffect(() => {
    load();
    getJson<DepartmentOption[]>("/api/v1/departments")
      .then(setDepartments)
      .catch(() => setDepartments([]));
    getJson<RoleOption[]>("/api/v1/admin/roles")
      .then(setRoles)
      .catch(() => setRoles([]));
  }, []);

  useEffect(() => {
    if (!detailUser) {
      setSessions(null);
      return;
    }
    getJson<SessionRow[]>(`/api/v1/users/${detailUser.id}/sessions`)
      .then(setSessions)
      .catch(() => setSessions(null));
  }, [detailUser]);

  function refreshDetailUser(updated: UserRow) {
    setUsers((prev) =>
      prev ? prev.map((u) => (u.id === updated.id ? updated : u)) : prev,
    );
    setDetailUser(updated);
  }

  const createForm = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserFormSchema),
  });

  async function onCreateSubmit(values: CreateUserFormValues) {
    try {
      await postJson(
        "/api/v1/users",
        {
          email: values.email,
          displayName: values.displayName,
          firstName: values.firstName,
          lastName: values.lastName,
          jobTitle: values.jobTitle || undefined,
          departmentId: values.departmentId || null,
          roleKeys: Array.from(selectedRoleKeys),
        },
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      toast({ title: "User created." });
      setCreateOpen(false);
      createForm.reset();
      setSelectedRoleKeys(new Set());
      await load();
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : "Couldn't create user.",
        variant: "destructive",
      });
    }
  }

  const editForm = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserFormSchema),
  });

  useEffect(() => {
    if (detailUser) {
      editForm.reset({
        displayName: detailUser.displayName,
        jobTitle: detailUser.jobTitle ?? "",
        departmentId: detailUser.departmentId ?? "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editForm identity is stable.
  }, [detailUser]);

  async function onEditSubmit(values: EditUserFormValues) {
    if (!detailUser) return;
    try {
      const updated = await patchJson<UserRow>(
        `/api/v1/users/${detailUser.id}`,
        {
          displayName: values.displayName,
          jobTitle: values.jobTitle || null,
          departmentId: values.departmentId || null,
        },
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      toast({ title: "User updated." });
      refreshDetailUser(updated);
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : "Couldn't update user.",
        variant: "destructive",
      });
    }
  }

  async function handleSetEnabled() {
    if (!enableTarget) return;
    setIsBusy(true);
    try {
      const updated = await postJson<UserRow>(
        `/api/v1/users/${enableTarget.user.id}/${enableTarget.enable ? "enable" : "disable"}`,
        {},
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      toast({
        title: enableTarget.enable ? "User enabled." : "User disabled.",
      });
      refreshDetailUser(updated);
      setEnableTarget(null);
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setIsBusy(false);
    }
  }

  async function handleAddRole() {
    if (!detailUser || !addRoleKey) return;
    try {
      const updated = await postJson<UserRow>(
        `/api/v1/users/${detailUser.id}/roles`,
        { roleKey: addRoleKey },
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      toast({ title: "Role assigned." });
      refreshDetailUser(updated);
      setAddRoleKey("");
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : "Couldn't assign role.",
        variant: "destructive",
      });
    }
  }

  async function handleRemoveRole(roleKey: string) {
    if (!detailUser) return;
    try {
      await deleteJson(`/api/v1/users/${detailUser.id}/roles/${roleKey}`, {
        csrfCookieName: CSRF_COOKIE_NAME,
      });
      toast({ title: "Role removed." });
      refreshDetailUser({
        ...detailUser,
        roleKeys: detailUser.roleKeys.filter((k) => k !== roleKey),
      });
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : "Couldn't remove role.",
        variant: "destructive",
      });
    }
  }

  async function handleRevokeSessions() {
    if (!revokeSessionsTarget) return;
    setIsBusy(true);
    try {
      await deleteJson(`/api/v1/users/${revokeSessionsTarget.id}/sessions`, {
        csrfCookieName: CSRF_COOKIE_NAME,
      });
      toast({ title: "Sessions revoked." });
      if (detailUser?.id === revokeSessionsTarget.id) setSessions([]);
      setRevokeSessionsTarget(null);
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setIsBusy(false);
    }
  }

  async function handleResetPassword() {
    if (!resetPasswordTarget || !newPassword) return;
    setIsBusy(true);
    try {
      await postJson(
        `/api/v1/users/${resetPasswordTarget.id}/password-reset`,
        { newPassword },
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      toast({
        title: "Password reset. Every session for this user was signed out.",
      });
      setResetPasswordTarget(null);
      setNewPassword("");
    } catch (err) {
      toast({
        title:
          err instanceof ApiError
            ? err.message
            : "Couldn't reset the password.",
        variant: "destructive",
      });
    } finally {
      setIsBusy(false);
    }
  }

  const columns: ColumnDef<UserRow>[] = [
    {
      accessorKey: "displayName",
      header: "Name",
      cell: ({ row }) => (
        <button
          type="button"
          className="font-medium hover:underline"
          onClick={() => setDetailUser(row.original)}
        >
          {row.original.displayName}
        </button>
      ),
    },
    { accessorKey: "email", header: "Email" },
    {
      accessorKey: "departmentName",
      header: "Department",
      cell: ({ row }) => row.original.departmentName ?? "—",
    },
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
      accessorKey: "roleKeys",
      header: "Roles",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.roleKeys.length === 0
            ? "—"
            : row.original.roleKeys.map((key) => (
                <Badge key={key} variant="outline">
                  {key}
                </Badge>
              ))}
        </div>
      ),
    },
    {
      accessorKey: "authProvider",
      header: "Sign-in",
      cell: ({ row }) =>
        row.original.authProvider === "LOCAL" ? "Local" : "Entra ID",
    },
  ];

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!users) return <p className="text-muted-foreground text-sm">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Users</h2>
        {canManage && (
          <Button
            onClick={() => {
              createForm.reset();
              setSelectedRoleKeys(new Set());
              setCreateOpen(true);
            }}
          >
            New user
          </Button>
        )}
      </div>

      {users.length === 0 ? (
        <EmptyState icon={UsersIcon} title="No users yet." />
      ) : (
        <DataTable columns={columns} data={users} emptyMessage="No users." />
      )}

      {/* Create user */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>New user</SheetTitle>
            <SheetDescription>
              Created as LOCAL and pending — they receive a password-setup
              email.
            </SheetDescription>
          </SheetHeader>
          <form
            onSubmit={createForm.handleSubmit(onCreateSubmit)}
            className="space-y-4 px-4 pb-4"
            noValidate
          >
            <div className="space-y-1.5">
              <Label htmlFor="new-user-email">Email</Label>
              <Input
                id="new-user-email"
                type="email"
                aria-invalid={!!createForm.formState.errors.email}
                {...createForm.register("email")}
              />
              {createForm.formState.errors.email && (
                <p className="text-destructive text-sm">
                  {createForm.formState.errors.email.message}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-user-first">First name</Label>
                <Input
                  id="new-user-first"
                  aria-invalid={!!createForm.formState.errors.firstName}
                  {...createForm.register("firstName")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-user-last">Last name</Label>
                <Input
                  id="new-user-last"
                  aria-invalid={!!createForm.formState.errors.lastName}
                  {...createForm.register("lastName")}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-user-display">Display name</Label>
              <Input
                id="new-user-display"
                aria-invalid={!!createForm.formState.errors.displayName}
                {...createForm.register("displayName")}
              />
              {createForm.formState.errors.displayName && (
                <p className="text-destructive text-sm">
                  {createForm.formState.errors.displayName.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-user-title">Job title</Label>
              <Input id="new-user-title" {...createForm.register("jobTitle")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-user-department">Department</Label>
              <Select
                value={createForm.watch("departmentId") || undefined}
                onValueChange={(v) =>
                  createForm.setValue("departmentId", v, {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger id="new-user-department">
                  <SelectValue placeholder="No department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Roles</Label>
              <div className="space-y-2 rounded-md border p-3">
                {roles.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No roles available.
                  </p>
                ) : (
                  roles.map((role) => (
                    <div key={role.key} className="flex items-center gap-2">
                      <Checkbox
                        id={`new-user-role-${role.key}`}
                        checked={selectedRoleKeys.has(role.key)}
                        onCheckedChange={(checked) =>
                          setSelectedRoleKeys((prev) => {
                            const next = new Set(prev);
                            if (checked) next.add(role.key);
                            else next.delete(role.key);
                            return next;
                          })
                        }
                      />
                      <Label
                        htmlFor={`new-user-role-${role.key}`}
                        className="font-normal"
                      >
                        {role.name}
                      </Label>
                    </div>
                  ))
                )}
              </div>
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={createForm.formState.isSubmitting}
            >
              Create user
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      {/* User detail */}
      <Sheet
        open={detailUser !== null}
        onOpenChange={(open) => !open && setDetailUser(null)}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {detailUser && (
            <>
              <SheetHeader>
                <SheetTitle>{detailUser.displayName}</SheetTitle>
                <SheetDescription>{detailUser.email}</SheetDescription>
              </SheetHeader>
              <div className="space-y-6 px-4 pb-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={STATUS_VARIANT[detailUser.status]}>
                    {detailUser.status}
                  </Badge>
                  <Badge variant="outline">
                    {detailUser.authProvider === "LOCAL"
                      ? "Local account"
                      : "Entra ID"}
                  </Badge>
                  {detailUser.lastLoginAt && (
                    <span className="text-muted-foreground text-xs">
                      Last login{" "}
                      {formatDistanceToNow(new Date(detailUser.lastLoginAt), {
                        addSuffix: true,
                      })}
                    </span>
                  )}
                </div>

                {canManage && (
                  <form
                    onSubmit={editForm.handleSubmit(onEditSubmit)}
                    className="space-y-3"
                    noValidate
                  >
                    <h3 className="text-sm font-semibold">Profile</h3>
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-user-display">Display name</Label>
                      <Input
                        id="edit-user-display"
                        {...editForm.register("displayName")}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-user-title">Job title</Label>
                      <Input
                        id="edit-user-title"
                        {...editForm.register("jobTitle")}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-user-department">Department</Label>
                      <Select
                        value={editForm.watch("departmentId") || undefined}
                        onValueChange={(v) =>
                          editForm.setValue("departmentId", v, {
                            shouldValidate: true,
                          })
                        }
                      >
                        <SelectTrigger id="edit-user-department">
                          <SelectValue placeholder="No department" />
                        </SelectTrigger>
                        <SelectContent>
                          {departments.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={editForm.formState.isSubmitting}
                    >
                      Save changes
                    </Button>
                  </form>
                )}

                {canManage && (
                  <div className="space-y-2 border-t pt-4">
                    <h3 className="text-sm font-semibold">Roles</h3>
                    <div className="flex flex-wrap gap-2">
                      {detailUser.roleKeys.length === 0 && (
                        <span className="text-muted-foreground text-sm">
                          No roles assigned.
                        </span>
                      )}
                      {detailUser.roleKeys.map((key) => (
                        <Badge key={key} variant="outline" className="gap-1">
                          {key}
                          <button
                            type="button"
                            aria-label={`Remove ${key} role`}
                            className="hover:text-destructive"
                            onClick={() => handleRemoveRole(key)}
                          >
                            ×
                          </button>
                        </Badge>
                      ))}
                    </div>
                    {roles.length > 0 && (
                      <div className="flex gap-2">
                        <Select
                          value={addRoleKey}
                          onValueChange={setAddRoleKey}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Add a role…" />
                          </SelectTrigger>
                          <SelectContent>
                            {roles
                              .filter(
                                (r) => !detailUser.roleKeys.includes(r.key),
                              )
                              .map((r) => (
                                <SelectItem key={r.key} value={r.key}>
                                  {r.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!addRoleKey}
                          onClick={handleAddRole}
                        >
                          Assign
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {canManage && (
                  <div className="space-y-2 border-t pt-4">
                    <h3 className="text-sm font-semibold">Account</h3>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setEnableTarget({
                            user: detailUser,
                            enable: detailUser.status === "DISABLED",
                          })
                        }
                      >
                        {detailUser.status === "DISABLED"
                          ? "Enable"
                          : "Disable"}{" "}
                        user
                      </Button>
                      {detailUser.authProvider === "LOCAL" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setResetPasswordTarget(detailUser)}
                        >
                          <KeyRound aria-hidden /> Reset password
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-2 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Active sessions</h3>
                    {canManage && sessions && sessions.length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setRevokeSessionsTarget(detailUser)}
                      >
                        Revoke all
                      </Button>
                    )}
                  </div>
                  {sessions === null ? (
                    <p className="text-muted-foreground text-sm">Loading…</p>
                  ) : sessions.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      No active sessions.
                    </p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {sessions.map((s) => (
                        <li
                          key={s.id}
                          className="text-muted-foreground flex justify-between gap-2"
                        >
                          <span className="truncate">
                            {s.userAgent ?? "Unknown device"}
                          </span>
                          <span>
                            {formatDistanceToNow(new Date(s.lastSeenAt), {
                              addSuffix: true,
                            })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmationDialog
        open={enableTarget !== null}
        onOpenChange={(open) => !open && setEnableTarget(null)}
        title={
          enableTarget?.enable ? "Enable this user?" : "Disable this user?"
        }
        description={
          enableTarget?.enable
            ? "They will be able to sign in again."
            : "This immediately revokes every active session for this user, and they will not be able to sign in until re-enabled."
        }
        confirmLabel={enableTarget?.enable ? "Enable" : "Disable"}
        variant={enableTarget?.enable ? "default" : "destructive"}
        isConfirming={isBusy}
        onConfirm={handleSetEnabled}
      />

      <ConfirmationDialog
        open={revokeSessionsTarget !== null}
        onOpenChange={(open) => !open && setRevokeSessionsTarget(null)}
        title="Revoke every session for this user?"
        description="They will be signed out of every device immediately."
        confirmLabel="Revoke all"
        variant="destructive"
        isConfirming={isBusy}
        onConfirm={handleRevokeSessions}
      />

      <Dialog
        open={resetPasswordTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setResetPasswordTarget(null);
            setNewPassword("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Sets a new password for {resetPasswordTarget?.displayName}{" "}
              directly and signs them out of every session. They must change it
              at next login.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="admin-new-password">New password</Label>
            <Input
              id="admin-new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setResetPasswordTarget(null)}
              disabled={isBusy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleResetPassword}
              disabled={isBusy || !newPassword}
            >
              Reset password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
