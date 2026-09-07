/**
 * Approval rule administration — API.md's `/api/v1/admin/approval-rules*`.
 * Rules are evaluated in ascending `priorityOrder` by
 * `resolveApprovalRoute` (unchanged here) — this module only edits rows,
 * never the matching logic. `POST /approval-rules/preview` already
 * exists (Phase 12's `previewApprovalRoute`) and isn't duplicated here.
 */
import { prisma } from "@/server/db";
import { NotFoundError } from "@/server/http/handler";
import { writeAudit } from "@/modules/audit";
import type { ApprovalRuleInput, UpdateApprovalRuleInput } from "./validation";

export async function listApprovalRules() {
  return prisma.approvalRule.findMany({ orderBy: { priorityOrder: "asc" } });
}

export async function createApprovalRule(
  input: ApprovalRuleInput,
  actorId: string,
) {
  return prisma.$transaction(async (tx) => {
    const created = await tx.approvalRule.create({ data: input });
    await writeAudit(
      {
        actorId,
        action: "APPROVAL_RULE_CREATED",
        entityType: "ApprovalRule",
        entityId: created.id,
      },
      tx,
    );
    return created;
  });
}

export async function updateApprovalRule(
  id: string,
  input: UpdateApprovalRuleInput,
  actorId: string,
) {
  const existing = await prisma.approvalRule.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError();

  return prisma.$transaction(async (tx) => {
    const updated = await tx.approvalRule.update({
      where: { id },
      data: input,
    });
    await writeAudit(
      {
        actorId,
        action: "APPROVAL_RULE_UPDATED",
        entityType: "ApprovalRule",
        entityId: id,
      },
      tx,
    );
    return updated;
  });
}

export async function deleteApprovalRule(
  id: string,
  actorId: string,
): Promise<void> {
  const existing = await prisma.approvalRule.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError();

  await prisma.$transaction(async (tx) => {
    await tx.approvalRule.delete({ where: { id } });
    await writeAudit(
      {
        actorId,
        action: "APPROVAL_RULE_DELETED",
        entityType: "ApprovalRule",
        entityId: id,
      },
      tx,
    );
  });
}
