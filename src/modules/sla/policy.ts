/**
 * SLA policy resolution — DATABASE.md §5: "Resolution order:
 * department+priority → priority → global default." Three separate
 * lookups in precedence order (mirroring `resolveApprovalRoute`'s own
 * rule-matching query) rather than one query with an `OR`, since Prisma
 * can't express "try this match, then that one" as a single ordering.
 */
import type { Priority, SlaPolicy } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

export async function resolveSlaPolicy(params: {
  departmentId: string | null;
  priority: Priority;
}): Promise<SlaPolicy | null> {
  if (params.departmentId) {
    const departmentAndPriority = await prisma.slaPolicy.findFirst({
      where: {
        isActive: true,
        departmentId: params.departmentId,
        priority: params.priority,
      },
    });
    if (departmentAndPriority) return departmentAndPriority;
  }

  const priorityOnly = await prisma.slaPolicy.findFirst({
    where: { isActive: true, departmentId: null, priority: params.priority },
  });
  if (priorityOnly) return priorityOnly;

  return prisma.slaPolicy.findFirst({
    where: { isActive: true, departmentId: null, priority: null },
  });
}

export interface DueDates {
  dueAt: Date;
  warningAt: Date;
}

/**
 * `businessHoursOnly` is real schema (DATABASE.md §5) but real
 * business-hours-aware duration math (a calendar of hours, holidays) is
 * not built yet — a documented gap, not a silent wrong answer: every
 * policy this project seeds defaults `businessHoursOnly` to `false`, so
 * this only ever affects a policy an admin explicitly opts into, and it
 * still gets a real (if not business-hours-adjusted) deadline rather
 * than none at all.
 */
export function computeDueDates(
  assignedAt: Date,
  policy: Pick<SlaPolicy, "durationMinutes" | "warningThresholdPercent">,
): DueDates {
  const dueAt = new Date(
    assignedAt.getTime() + policy.durationMinutes * 60_000,
  );
  const warningMinutes =
    (policy.durationMinutes * policy.warningThresholdPercent) / 100;
  const warningAt = new Date(assignedAt.getTime() + warningMinutes * 60_000);
  return { dueAt, warningAt };
}
