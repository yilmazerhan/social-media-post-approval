import { NextResponse } from "next/server";
import {
  listAuditLogs,
  listAuditLogsForExport,
} from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";
import { toCsv } from "@/server/http/csv";

/** `?action=&entityType=&entityId=&actorId=&postId=&from=&to=&page=&pageSize=&format=json|csv` — API.md's `GET /admin/audit-logs`. */
export const GET = protectedHandler(
  { permission: "AUDIT_READ" },
  async ({ request }) => {
    const params = new URL(request.url).searchParams;
    const fromParam = params.get("from");
    const toParam = params.get("to");

    const filters = {
      action: params.get("action") ?? undefined,
      entityType: params.get("entityType") ?? undefined,
      entityId: params.get("entityId") ?? undefined,
      actorId: params.get("actorId") ?? undefined,
      postId: params.get("postId") ?? undefined,
      from: fromParam ? new Date(fromParam) : undefined,
      to: toParam ? new Date(toParam) : undefined,
    };

    if (params.get("format") === "csv") {
      const items = await listAuditLogsForExport(filters);
      const csv = toCsv(items, [
        { key: "createdAt", header: "Timestamp" },
        { key: "action", header: "Action" },
        { key: "entityType", header: "Entity type" },
        { key: "entityId", header: "Entity ID" },
        { key: "actorEmail", header: "Actor" },
        { key: "postId", header: "Post ID" },
        { key: "ipAddress", header: "IP address" },
      ]);
      return {
        raw: new NextResponse(csv, {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": 'attachment; filename="audit-logs.csv"',
          },
        }),
      };
    }

    const page = Number(params.get("page") ?? "1");
    const pageSize = Number(params.get("pageSize") ?? "20");
    const result = await listAuditLogs({
      ...filters,
      page: Number.isFinite(page) && page > 0 ? page : 1,
      pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 20,
    });

    return { data: result.items, meta: { total: result.total } };
  },
);
