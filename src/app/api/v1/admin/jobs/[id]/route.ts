import { getJob } from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

export const GET = protectedHandler(
  { permission: "JOB_MANAGE" },
  async ({ params }) => {
    const job = await getJob(BigInt(params.id));
    return { data: job };
  },
);
