import { listJobSchedules } from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

export const GET = protectedHandler({ permission: "JOB_MANAGE" }, async () => {
  const schedules = await listJobSchedules();
  return { data: schedules };
});
