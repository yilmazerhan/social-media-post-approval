/**
 * Group administration — API.md's `/api/v1/groups`. Groups double as
 * approval targets (`isApprovalGroup`, DATABASE.md §3) — deactivating one
 * doesn't touch existing `ApprovalAssignment.assigneeGroupId` rows, it
 * only stops new routing from picking it (that check lives in
 * `route-resolution.ts`, unchanged by this module).
 */
import { prisma } from "@/server/db";
import { NotFoundError } from "@/server/http/handler";
import { writeAudit } from "@/modules/audit";
import type { GroupInput, UpdateGroupInput } from "./validation";

export interface GroupDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isApprovalGroup: boolean;
  isActive: boolean;
  memberCount: number;
}

export interface GroupMemberDto {
  userId: string;
  displayName: string;
  email: string;
}

async function toGroupDto(groupId: string): Promise<GroupDto> {
  const group = await prisma.group.findUniqueOrThrow({
    where: { id: groupId },
    include: { _count: { select: { members: true } } },
  });
  return {
    id: group.id,
    key: group.key,
    name: group.name,
    description: group.description,
    isApprovalGroup: group.isApprovalGroup,
    isActive: group.isActive,
    memberCount: group._count.members,
  };
}

export async function listGroups(): Promise<GroupDto[]> {
  const groups = await prisma.group.findMany({ orderBy: { name: "asc" } });
  return Promise.all(groups.map((g) => toGroupDto(g.id)));
}

export async function createGroup(
  input: GroupInput,
  actorId: string,
): Promise<GroupDto> {
  const group = await prisma.$transaction(async (tx) => {
    const created = await tx.group.create({ data: input });
    await writeAudit(
      {
        actorId,
        action: "GROUP_CREATED",
        entityType: "Group",
        entityId: created.id,
      },
      tx,
    );
    return created;
  });
  return toGroupDto(group.id);
}

export async function updateGroup(
  id: string,
  input: UpdateGroupInput,
  actorId: string,
): Promise<GroupDto> {
  const existing = await prisma.group.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError();

  await prisma.$transaction(async (tx) => {
    await tx.group.update({ where: { id }, data: input });
    await writeAudit(
      { actorId, action: "GROUP_UPDATED", entityType: "Group", entityId: id },
      tx,
    );
  });
  return toGroupDto(id);
}

export async function listGroupMembers(
  groupId: string,
): Promise<GroupMemberDto[]> {
  const memberships = await prisma.userGroup.findMany({
    where: { groupId },
    include: { user: { select: { id: true, displayName: true, email: true } } },
    orderBy: { user: { displayName: "asc" } },
  });
  return memberships.map((m) => ({
    userId: m.user.id,
    displayName: m.user.displayName,
    email: m.user.email,
  }));
}

export async function addGroupMember(
  groupId: string,
  userId: string,
  actorId: string,
): Promise<void> {
  const [group, user] = await Promise.all([
    prisma.group.findUnique({ where: { id: groupId } }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);
  if (!group || !user) throw new NotFoundError();

  await prisma.$transaction(async (tx) => {
    await tx.userGroup.upsert({
      where: { userId_groupId: { userId, groupId } },
      create: { userId, groupId },
      update: {},
    });
    await writeAudit(
      {
        actorId,
        action: "GROUP_MEMBER_ADDED",
        entityType: "Group",
        entityId: groupId,
        metadata: { userId },
      },
      tx,
    );
  });
}

export async function removeGroupMember(
  groupId: string,
  userId: string,
  actorId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.userGroup.deleteMany({ where: { groupId, userId } });
    await writeAudit(
      {
        actorId,
        action: "GROUP_MEMBER_REMOVED",
        entityType: "Group",
        entityId: groupId,
        metadata: { userId },
      },
      tx,
    );
  });
}
