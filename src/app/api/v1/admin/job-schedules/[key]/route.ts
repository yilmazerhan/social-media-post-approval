import {
  updateJobSchedule,
  jobScheduleUpdateSchema,
} from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

export const PATCH = protectedHandler<
  ReturnType<typeof jobScheduleUpdateSchema.parse>,
  undefined
>(
  { schema: jobScheduleUpdateSchema, permission: "JOB_MANAGE" },
  async ({ params, input, user }) => {
    const updated = await updateJobSchedule(params.key, input, user.id);
    return { data: updated };
  },
);
