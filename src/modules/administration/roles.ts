/**
 * Role and permission administration — API.md's `/api/v1/admin/roles`,
 * `/permissions`. `isSystem` roles (EMPLOYEE/APPROVER/ADMIN, seeded by
 * `bootstrap-system-data.ts`) can have their permission grants edited —
 * "extended" — but there is no delete endpoint for any role, system or
 * custom (API.md lists only `GET/POST /roles`, `PATCH /roles/:id`).
 */
import { prisma } from "@/server/db";
import { NotFoundError } from "@/server/http/handler";
import { writeAudit } from "@/modules/audit";
import { PERMISSIONS, type PermissionKey } from "@/modules/authorization";
import type { CreateRoleInput } from "./validation";

export interface RoleDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissionKeys: string[];
}

async function toRoleDto(roleId: string): Promise<RoleDto> {
  const role = await prisma.role.findUniqueOrThrow({
    where: { id: roleId },
    include: { permissions: { include: { permission: true } } },
  });
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissionKeys: role.permissions.map((p) => p.permission.key),
  };
}

export async function listRoles(): Promise<RoleDto[]> {
  const roles = await prisma.role.findMany({ orderBy: { name: "asc" } });
  return Promise.all(roles.map((r) => toRoleDto(r.id)));
}

export function listPermissions() {
  return PERMISSIONS;
}

export async function createRole(
  input: CreateRoleInput,
  actorId: string,
): Promise<RoleDto> {
  const permissions = await prisma.permission.findMany({
    where: { key: { in: input.permissionKeys } },
  });

  const role = await prisma.$transaction(async (tx) => {
    const created = await tx.role.create({
      data: {
        key: input.key,
        name: input.name,
        description: input.description ?? null,
        isSystem: false,
      },
    });
    if (permissions.length > 0) {
      await tx.rolePermission.createMany({
        data: permissions.map((p) => ({
          roleId: created.id,
          permissionId: p.id,
        })),
      });
    }
    await writeAudit(
      {
        actorId,
        action: "ROLE_CREATED",
        entityType: "Role",
        entityId: created.id,
      },
      tx,
    );
    return created;
  });

  return toRoleDto(role.id);
}

export async function updateRolePermissions(
  roleId: string,
  permissionKeys: PermissionKey[] | string[],
  actorId: string,
): Promise<RoleDto> {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw new NotFoundError();

  const permissions = await prisma.permission.findMany({
    where: { key: { in: permissionKeys } },
  });

  await prisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId } });
    if (permissions.length > 0) {
      await tx.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId, permissionId: p.id })),
      });
    }
    await writeAudit(
      {
        actorId,
        action: "ROLE_PERMISSIONS_UPDATED",
        entityType: "Role",
        entityId: roleId,
        metadata: { permissionKeys },
      },
      tx,
    );
  });

  return toRoleDto(roleId);
}
