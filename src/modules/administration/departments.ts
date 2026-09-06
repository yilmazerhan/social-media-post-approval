/**
 * Department administration — API.md's `/api/v1/departments`.
 * `managerId` feeds two things elsewhere: `DEPARTMENT_MANAGER`-routed
 * approval rules (`route-resolution.ts`) and SLA escalation
 * (`sla/jobs.ts`) — this module only edits the field, both already read
 * it directly rather than through a cached copy.
 */
import { prisma } from "@/server/db";
import { NotFoundError } from "@/server/http/handler";
import { writeAudit } from "@/modules/audit";
import type { DepartmentInput, UpdateDepartmentInput } from "./validation";

export interface DepartmentDto {
  id: string;
  key: string;
  name: string;
  managerId: string | null;
  managerName: string | null;
  parentId: string | null;
  isActive: boolean;
}

async function toDepartmentDto(id: string): Promise<DepartmentDto> {
  const department = await prisma.department.findUniqueOrThrow({
    where: { id },
    include: { manager: { select: { displayName: true } } },
  });
  return {
    id: department.id,
    key: department.key,
    name: department.name,
    managerId: department.managerId,
    managerName: department.manager?.displayName ?? null,
    parentId: department.parentId,
    isActive: department.isActive,
  };
}

export async function listDepartments(): Promise<DepartmentDto[]> {
  const departments = await prisma.department.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
  });
  return Promise.all(departments.map((d) => toDepartmentDto(d.id)));
}

export async function createDepartment(
  input: DepartmentInput,
  actorId: string,
): Promise<DepartmentDto> {
  const department = await prisma.$transaction(async (tx) => {
    const created = await tx.department.create({
      data: {
        key: input.key,
        name: input.name,
        managerId: input.managerId ?? null,
        parentId: input.parentId ?? null,
        isActive: input.isActive,
      },
    });
    await writeAudit(
      {
        actorId,
        action: "DEPARTMENT_CREATED",
        entityType: "Department",
        entityId: created.id,
      },
      tx,
    );
    return created;
  });
  return toDepartmentDto(department.id);
}

export async function updateDepartment(
  id: string,
  input: UpdateDepartmentInput,
  actorId: string,
): Promise<DepartmentDto> {
  const existing = await prisma.department.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) throw new NotFoundError();

  await prisma.$transaction(async (tx) => {
    await tx.department.update({ where: { id }, data: input });
    await writeAudit(
      {
        actorId,
        action: "DEPARTMENT_UPDATED",
        entityType: "Department",
        entityId: id,
      },
      tx,
    );
  });
  return toDepartmentDto(id);
}
