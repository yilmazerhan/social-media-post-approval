/**
 * Retention administration — API.md's `/api/v1/admin/retention-policies`,
 * `/retention/run`, `/retention/runs`. Wraps Phase 20's
 * `runRetentionForTarget`; this module only edits policy rows and
 * exposes run history — the actual counting/deleting logic isn't
 * duplicated here.
 */
import type { RetentionRun, RetentionTarget } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { NotFoundError } from "@/server/http/handler";
import { writeAudit } from "@/modules/audit";
import { runRetentionForTarget } from "@/modules/retention";
import type { RetentionPolicyInput } from "./validation";

/** `RetentionRun.id`/`freedBytes` are Prisma `BigInt`s, which `JSON.stringify` can't serialize — carried as strings instead. */
function serializeRetentionRun(run: RetentionRun) {
  return {
    ...run,
    id: run.id.toString(),
    freedBytes: run.freedBytes === null ? null : run.freedBytes.toString(),
  };
}

export async function listRetentionPolicies() {
  return prisma.retentionPolicy.findMany({ orderBy: { target: "asc" } });
}

export async function updateRetentionPolicy(
  target: RetentionTarget,
  input: RetentionPolicyInput,
  actorId: string,
) {
  const existing = await prisma.retentionPolicy.findUnique({
    where: { target },
  });
  if (!existing) throw new NotFoundError();

  return prisma.$transaction(async (tx) => {
    const updated = await tx.retentionPolicy.update({
      where: { target },
      data: input,
    });
    await writeAudit(
      {
        actorId,
        action: "RETENTION_POLICY_UPDATED",
        entityType: "RetentionPolicy",
        entityId: target,
      },
      tx,
    );
    return updated;
  });
}

/** `POST /retention/run` — `dryRun` defaults to `true` (API.md), and the caller's `dryRun` still passes through as an override of the policy's own stored flag, matching "retention always defaults to dry run" for a one-off manual run. */
export async function runRetention(target: RetentionTarget, dryRun: boolean) {
  return runRetentionForTarget(target, dryRun);
}

export async function listRetentionRuns(page: number, pageSize: number) {
  const [items, total] = await Promise.all([
    prisma.retentionRun.findMany({
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.retentionRun.count(),
  ]);
  return { items: items.map(serializeRetentionRun), total };
}
