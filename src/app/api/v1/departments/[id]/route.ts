import {
  updateDepartment,
  updateDepartmentSchema,
} from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

export const PATCH = protectedHandler<
  ReturnType<typeof updateDepartmentSchema.parse>,
  undefined
>(
  { schema: updateDepartmentSchema, permission: "DEPARTMENT_MANAGE" },
  async ({ params, input, user }) => {
    const updated = await updateDepartment(params.id, input, user.id);
    return { data: updated };
  },
);
