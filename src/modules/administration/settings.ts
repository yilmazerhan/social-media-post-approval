/**
 * System settings — API.md's `/api/v1/admin/settings`, DATABASE.md §7's
 * `SystemSetting`. `isSecret` rows exist in the schema but nothing seeds
 * one yet (no secret belongs in this table at all — CONFIGURATION.md's
 * env vars are the only place for those); listing simply omits `value`
 * for any row so flagged, so a secret can never leak through this API
 * even if one were added later.
 */
import { prisma } from "@/server/db";
import { NotFoundError } from "@/server/http/handler";
import { writeAudit } from "@/modules/audit";

export interface SystemSettingDto {
  key: string;
  value: string | null;
  type: string;
  category: string;
  description: string | null;
  isSecret: boolean;
}

export async function listSystemSettings(): Promise<SystemSettingDto[]> {
  const settings = await prisma.systemSetting.findMany({
    orderBy: [{ category: "asc" }, { key: "asc" }],
  });
  return settings.map((s) => ({
    key: s.key,
    value: s.isSecret ? null : s.value,
    type: s.type,
    category: s.category,
    description: s.description,
    isSecret: s.isSecret,
  }));
}

export async function updateSystemSetting(
  key: string,
  value: string,
  actorId: string,
): Promise<SystemSettingDto> {
  const existing = await prisma.systemSetting.findUnique({ where: { key } });
  if (!existing) throw new NotFoundError();

  await prisma.$transaction(async (tx) => {
    await tx.systemSetting.update({
      where: { key },
      data: { value, updatedById: actorId },
    });
    await writeAudit(
      {
        actorId,
        action: "SETTING_UPDATED",
        entityType: "SystemSetting",
        entityId: key,
      },
      tx,
    );
  });

  const updated = await prisma.systemSetting.findUniqueOrThrow({
    where: { key },
  });
  return {
    key: updated.key,
    value: updated.isSecret ? null : updated.value,
    type: updated.type,
    category: updated.category,
    description: updated.description,
    isSecret: updated.isSecret,
  };
}
