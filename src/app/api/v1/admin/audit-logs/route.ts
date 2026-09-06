import { listAuditLogs } from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

export const GET = protectedHandler(
  { permission: "AUDIT_READ" },
  async ({ request }) => {
    const params = new URL(request.url).searchParams;
    const page = Number(params.get("page") ?? "1");
    const pageSize = Number(params.get("pageSize") ?? "20");

    const result = await listAuditLogs({
      action: params.get("action") ?? undefined,
      entityType: params.get("entityType") ?? undefined,
      actorId: params.get("actorId") ?? undefined,
      page: Number.isFinite(page) && page > 0 ? page : 1,
      pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 20,
    });

    return { data: result.items, meta: { total: result.total } };
  },
);
