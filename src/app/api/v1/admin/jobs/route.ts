import type { JobStatus, JobType } from "@/generated/prisma/client";
import { listJobs } from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

export const GET = protectedHandler(
  { permission: "JOB_MANAGE" },
  async ({ request }) => {
    const params = new URL(request.url).searchParams;
    const page = Number(params.get("page") ?? "1");
    const pageSize = Number(params.get("pageSize") ?? "20");

    const result = await listJobs({
      status: (params.get("status") as JobStatus) ?? undefined,
      type: (params.get("type") as JobType) ?? undefined,
      page: Number.isFinite(page) && page > 0 ? page : 1,
      pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 20,
    });

    return { data: result.items, meta: { total: result.total } };
  },
);
