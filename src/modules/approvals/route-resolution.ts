/**
 * Approval routing — DATABASE.md §5: "Routing is computed server-side at
 * submission — never in the frontend." Rules are evaluated in ascending
 * `priorityOrder`; the first one that matches the post *and* resolves to
 * a real assignee wins. This is also what the editor's own "Approval
 * route" panel calls to preview the outcome before submitting — the same
 * function, not a second one the frontend could get out of sync with.
 *
 * A resolved rule's `allowCreatorOverride` is the only thing that lets a
 * creator's own choice (`requestedApproverId`/`requestedGroupId`) replace
 * the rule's own target; full creator-override validation, reassignment
 * and the admin dry-run preview UI are Phase 12's job — this is just the
 * matching query both that phase and this one need.
 */
import type { ApprovalRule, Priority } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

export interface ResolvedRoute {
  rule: ApprovalRule;
  assigneeUserId: string | null;
  assigneeGroupId: string | null;
}

export interface RoutablePost {
  departmentId: string | null;
  priority: Priority;
  creatorId: string;
  requestedApproverId?: string | null;
  requestedGroupId?: string | null;
}

async function resolveAssignee(
  rule: ApprovalRule,
  post: RoutablePost,
): Promise<{
  assigneeUserId: string | null;
  assigneeGroupId: string | null;
} | null> {
  if (rule.allowCreatorOverride) {
    if (post.requestedApproverId) {
      return {
        assigneeUserId: post.requestedApproverId,
        assigneeGroupId: null,
      };
    }
    if (post.requestedGroupId) {
      return { assigneeUserId: null, assigneeGroupId: post.requestedGroupId };
    }
  }

  switch (rule.targetType) {
    case "USER":
      return rule.targetUserId
        ? { assigneeUserId: rule.targetUserId, assigneeGroupId: null }
        : null;
    case "GROUP":
      return rule.targetGroupId
        ? { assigneeUserId: null, assigneeGroupId: rule.targetGroupId }
        : null;
    case "DEPARTMENT_MANAGER": {
      if (!post.departmentId) return null;
      const department = await prisma.department.findUnique({
        where: { id: post.departmentId },
        select: { managerId: true },
      });
      return department?.managerId
        ? { assigneeUserId: department.managerId, assigneeGroupId: null }
        : null;
    }
  }
}

/** The display name of a resolved route's assignee — a user's `displayName` or a group's `name`. */
export async function resolveAssigneeName(
  route: ResolvedRoute,
): Promise<string | null> {
  if (route.assigneeUserId) {
    const user = await prisma.user.findUnique({
      where: { id: route.assigneeUserId },
      select: { displayName: true },
    });
    return user?.displayName ?? null;
  }
  if (route.assigneeGroupId) {
    const group = await prisma.group.findUnique({
      where: { id: route.assigneeGroupId },
      select: { name: true },
    });
    return group?.name ?? null;
  }
  return null;
}

export interface RoutePreviewResult {
  rule: { id: string; name: string; priorityOrder: number } | null;
  assigneeName: string | null;
}

/** UI_UX_SPEC.md §6's admin "test this rule" preview — the exact same matching query as submission, run against a hypothetical post instead of a real one. */
export async function previewApprovalRoute(
  post: RoutablePost,
): Promise<RoutePreviewResult> {
  const route = await resolveApprovalRoute(post);
  if (!route) return { rule: null, assigneeName: null };
  const assigneeName = await resolveAssigneeName(route);
  return {
    rule: {
      id: route.rule.id,
      name: route.rule.name,
      priorityOrder: route.rule.priorityOrder,
    },
    assigneeName,
  };
}

/** The first active rule (by `priorityOrder`) that matches the post and resolves to a real assignee, or `null`. */
export async function resolveApprovalRoute(
  post: RoutablePost,
): Promise<ResolvedRoute | null> {
  const creatorGroups = await prisma.userGroup.findMany({
    where: { userId: post.creatorId },
    select: { groupId: true },
  });
  const creatorGroupIds = new Set(creatorGroups.map((g) => g.groupId));

  const rules = await prisma.approvalRule.findMany({
    where: { isActive: true },
    orderBy: { priorityOrder: "asc" },
  });

  for (const rule of rules) {
    if (rule.departmentId && rule.departmentId !== post.departmentId) continue;
    if (rule.priority && rule.priority !== post.priority) continue;
    if (rule.creatorGroupId && !creatorGroupIds.has(rule.creatorGroupId))
      continue;

    const assignee = await resolveAssignee(rule, post);
    if (assignee) return { rule, ...assignee };
  }

  return null;
}
