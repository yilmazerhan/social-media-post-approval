import { runJobScheduleNow } from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

export const POST = protectedHandler(
  { permission: "JOB_MANAGE" },
  async ({ params, user }) => {
    const job = await runJobScheduleNow(params.key, user.id);
    return { data: job, status: 202 };
  },
);
