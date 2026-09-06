"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { ColumnDef } from "@tanstack/react-table";
import { UsersRound } from "lucide-react";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  deleteJson,
  getJson,
  patchJson,
  postJson,
} from "@/lib/api-client";
import { UserPicker } from "../user-picker";

interface GroupDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isApprovalGroup: boolean;
  isActive: boolean;
  memberCount: number;
}

interface GroupMemberDto {
  userId: string;
  displayName: string;
  email: string;
}

const groupFormSchema = z.object({
  key: z.string().min(1, "Required."),
  name: z.string().min(1, "Required."),
  description: z.string().optional(),
});
type GroupFormValues = z.infer<typeof groupFormSchema>;

export function GroupsSection() {
  const { toast } = useToast();
  const [groups, setGroups] = useState<GroupDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createIsApprovalGroup, setCreateIsApprovalGroup] = useState(false);
  const [createIsActive, setCreateIsActive] = useState(true);

  const [editGroup, setEditGroup] = useState<GroupDto | null>(null);
  const [editIsApprovalGroup, setEditIsApprovalGroup] = useState(false);
  const [editIsActive, setEditIsActive] = useState(true);

  const [membersGroup, setMembersGroup] = useState<GroupDto | null>(null);
  const [members, setMembers] = useState<GroupMemberDto[] | null>(null);

  async function load() {
    setError(null);
    try {
      const data = await getJson<GroupDto[]>("/api/v1/groups");
      setGroups(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!membersGroup) {
      setMembers(null);
      return;
    }
    getJson<GroupMemberDto[]>(`/api/v1/groups/${membersGroup.id}/members`)
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [membersGroup]);

  const createForm = useForm<GroupFormValues>({
    resolver: zodResolver(groupFormSchema),
  });
  const editForm = useForm<GroupFormValues>({
    resolver: zodResolver(groupFormSchema),
  });

  useEffect(() => {
    if (editGroup) {
      editForm.reset({
        key: editGroup.key,
        name: editGroup.name,
        description: editGroup.description ?? "",
      });
      setEditIsApprovalGroup(editGroup.isApprovalGroup);
      setEditIsActive(editGroup.isActive);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editForm identity is stable.
  }, [editGroup]);

  async function onCreateSubmit(values: GroupFormValues) {
    try {
      await postJson(
        "/api/v1/groups",
        {
          key: values.key,
          name: values.name,
          description: values.description || undefined,
          isApprovalGroup: createIsApprovalGroup,
          isActive: createIsActive,
        },
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      toast({ title: "Group created." });
      setCreateOpen(false);
      createForm.reset();
      setCreateIsApprovalGroup(false);
      setCreateIsActive(true);
      await load();
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : "Couldn't create group.",
        variant: "destructive",
      });
    }
  }

  async function onEditSubmit(values: GroupFormValues) {
    if (!editGroup) return;
    try {
      const updated = await patchJson<GroupDto>(
        `/api/v1/groups/${editGroup.id}`,
        {
          key: values.key,
          name: values.name,
          description: values.description || undefined,
          isApprovalGroup: editIsApprovalGroup,
          isActive: editIsActive,
        },
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      toast({ title: "Group updated." });
      setGroups((prev) =>
        prev ? prev.map((g) => (g.id === updated.id ? updated : g)) : prev,
      );
      setEditGroup(null);
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : "Couldn't update group.",
        variant: "destructive",
      });
    }
  }

  async function handleAddMember(userId: string) {
    if (!membersGroup) return;
    try {
      await postJson(
        `/api/v1/groups/${membersGroup.id}/members`,
        { userId },
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      const refreshed = await getJson<GroupMemberDto[]>(
        `/api/v1/groups/${membersGroup.id}/members`,
      );
      setMembers(refreshed);
      setGroups((prev) =>
        prev
          ? prev.map((g) =>
              g.id === membersGroup.id
                ? { ...g, memberCount: refreshed.length }
                : g,
            )
          : prev,
      );
      toast({ title: "Member added." });
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : "Couldn't add member.",
        variant: "destructive",
      });
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!membersGroup) return;
    try {
      await deleteJson(`/api/v1/groups/${membersGroup.id}/members/${userId}`, {
        csrfCookieName: CSRF_COOKIE_NAME,
      });
      setMembers((prev) => prev?.filter((m) => m.userId !== userId) ?? null);
      setGroups((prev) =>
        prev
          ? prev.map((g) =>
              g.id === membersGroup.id
                ? { ...g, memberCount: Math.max(0, g.memberCount - 1) }
                : g,
            )
          : prev,
      );
      toast({ title: "Member removed." });
    } catch (err) {
      toast({
        title:
          err instanceof ApiError ? err.message : "Couldn't remove member.",
        variant: "destructive",
      });
    }
  }

  const columns: ColumnDef<GroupDto>[] = [
    {
      accessorKey: "name",
      header: "Group",
      cell: ({ row }) => (
        <button
          type="button"
          className="font-medium hover:underline"
          onClick={() => setEditGroup(row.original)}
        >
          {row.original.name}
        </button>
      ),
    },
    { accessorKey: "key", header: "Key" },
    {
      accessorKey: "isApprovalGroup",
      header: "Approval group",
      cell: ({ row }) => (row.original.isApprovalGroup ? "Yes" : "No"),
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
      accessorKey: "memberCount",
      header: "Members",
      cell: ({ row }) => (
        <button
          type="button"
          className="hover:underline"
          onClick={() => setMembersGroup(row.original)}
        >
          {row.original.memberCount}
        </button>
      ),
    },
  ];

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!groups) return <p className="text-muted-foreground text-sm">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Groups</h2>
        <Button
          onClick={() => {
            createForm.reset();
            setCreateIsApprovalGroup(false);
            setCreateIsActive(true);
            setCreateOpen(true);
          }}
        >
          New group
        </Button>
      </div>

      {groups.length === 0 ? (
        <EmptyState icon={UsersRound} title="No groups yet." />
      ) : (
        <DataTable columns={columns} data={groups} emptyMessage="No groups." />
      )}

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>New group</SheetTitle>
          </SheetHeader>
          <form
            onSubmit={createForm.handleSubmit(onCreateSubmit)}
            className="space-y-4 px-4 pb-4"
            noValidate
          >
            <div className="space-y-1.5">
              <Label htmlFor="new-group-key">Key</Label>
              <Input
                id="new-group-key"
                aria-invalid={!!createForm.formState.errors.key}
                {...createForm.register("key")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-group-name">Name</Label>
              <Input
                id="new-group-name"
                aria-invalid={!!createForm.formState.errors.name}
                {...createForm.register("name")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-group-description">Description</Label>
              <Textarea
                id="new-group-description"
                {...createForm.register("description")}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="new-group-approval" className="font-normal">
                Approval group (usable as a routing target)
              </Label>
              <Switch
                id="new-group-approval"
                checked={createIsApprovalGroup}
                onCheckedChange={setCreateIsApprovalGroup}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="new-group-active" className="font-normal">
                Active
              </Label>
              <Switch
                id="new-group-active"
                checked={createIsActive}
                onCheckedChange={setCreateIsActive}
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={createForm.formState.isSubmitting}
            >
              Create group
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet
        open={editGroup !== null}
        onOpenChange={(o) => !o && setEditGroup(null)}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {editGroup && (
            <>
              <SheetHeader>
                <SheetTitle>{editGroup.name}</SheetTitle>
              </SheetHeader>
              <form
                onSubmit={editForm.handleSubmit(onEditSubmit)}
                className="space-y-4 px-4 pb-4"
                noValidate
              >
                <div className="space-y-1.5">
                  <Label htmlFor="edit-group-key">Key</Label>
                  <Input id="edit-group-key" {...editForm.register("key")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-group-name">Name</Label>
                  <Input id="edit-group-name" {...editForm.register("name")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-group-description">Description</Label>
                  <Textarea
                    id="edit-group-description"
                    {...editForm.register("description")}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="edit-group-approval" className="font-normal">
                    Approval group
                  </Label>
                  <Switch
                    id="edit-group-approval"
                    checked={editIsApprovalGroup}
                    onCheckedChange={setEditIsApprovalGroup}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="edit-group-active" className="font-normal">
                    Active
                  </Label>
                  <Switch
                    id="edit-group-active"
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

      <Sheet
        open={membersGroup !== null}
        onOpenChange={(o) => !o && setMembersGroup(null)}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {membersGroup && (
            <>
              <SheetHeader>
                <SheetTitle>{membersGroup.name} — members</SheetTitle>
                <SheetDescription>
                  Add or remove members of this group.
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-4">
                <UserPicker
                  placeholder="Search users to add…"
                  onSelect={(u) => handleAddMember(u.id)}
                />
                {members === null ? (
                  <p className="text-muted-foreground text-sm">Loading…</p>
                ) : members.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No members.</p>
                ) : (
                  <ul className="divide-y rounded-md border">
                    {members.map((m) => (
                      <li
                        key={m.userId}
                        className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                      >
                        <span>
                          {m.displayName}{" "}
                          <span className="text-muted-foreground">
                            {m.email}
                          </span>
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveMember(m.userId)}
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
