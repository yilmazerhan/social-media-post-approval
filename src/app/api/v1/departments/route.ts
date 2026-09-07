import {
  listDepartments,
  createDepartment,
  departmentSchema,
} from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

export const GET = protectedHandler({}, async () => {
  const departments = await listDepartments();
  return { data: departments };
});

export const POST = protectedHandler<
  ReturnType<typeof departmentSchema.parse>,
  undefined
>(
  { schema: departmentSchema, permission: "DEPARTMENT_MANAGE" },
  async ({ input, user }) => {
    const created = await createDepartment(input, user.id);
    return { data: created, status: 201 };
  },
);
