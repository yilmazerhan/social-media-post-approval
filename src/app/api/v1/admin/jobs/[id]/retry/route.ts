import { retryJob } from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

export const POST = protectedHandler(
  { permission: "JOB_MANAGE" },
  async ({ params, user }) => {
    const job = await retryJob(BigInt(params.id), user.id);
    return { data: job };
  },
);
