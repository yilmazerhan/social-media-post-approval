/**
 * SLA policy administration — API.md's `/api/v1/admin/sla-policies*`.
 * `resolveSlaPolicy` (Phase 19) reads these rows directly at submission
 * time; this module only edits them.
 */
import { prisma } from "@/server/db";
import { NotFoundError } from "@/server/http/handler";
import { writeAudit } from "@/modules/audit";
import type { SlaPolicyInput, UpdateSlaPolicyInput } from "./validation";

export async function listSlaPolicies() {
  return prisma.slaPolicy.findMany({ orderBy: { name: "asc" } });
}

export async function createSlaPolicy(input: SlaPolicyInput, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const created = await tx.slaPolicy.create({ data: input });
    await writeAudit(
      {
        actorId,
        action: "SLA_POLICY_CREATED",
        entityType: "SlaPolicy",
        entityId: created.id,
      },
      tx,
    );
    return created;
  });
}

export async function updateSlaPolicy(
  id: string,
  input: UpdateSlaPolicyInput,
  actorId: string,
) {
  const existing = await prisma.slaPolicy.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError();

  return prisma.$transaction(async (tx) => {
    const updated = await tx.slaPolicy.update({ where: { id }, data: input });
    await writeAudit(
      {
        actorId,
        action: "SLA_POLICY_UPDATED",
        entityType: "SlaPolicy",
        entityId: id,
      },
      tx,
    );
    return updated;
  });
}

export async function deleteSlaPolicy(
  id: string,
  actorId: string,
): Promise<void> {
  const existing = await prisma.slaPolicy.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError();

  await prisma.$transaction(async (tx) => {
    await tx.slaPolicy.delete({ where: { id } });
    await writeAudit(
      {
        actorId,
        action: "SLA_POLICY_DELETED",
        entityType: "SlaPolicy",
        entityId: id,
      },
      tx,
    );
  });
}
