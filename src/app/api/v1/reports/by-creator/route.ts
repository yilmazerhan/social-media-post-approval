import type { Priority } from "@/generated/prisma/client";
import { NextResponse } from "next/server";
import { getByCreatorReport, toCsv } from "@/modules/reports";
import { protectedHandler } from "@/server/http/handler";
import { jsonError } from "@/server/http/envelope";

const PRIORITY_VALUES: readonly Priority[] = [
  "LOW",
  "NORMAL",
  "HIGH",
  "URGENT",
];

/** `?from=&to=&departmentId=&priority=&format=json|csv` — API.md's `/reports/by-creator`. */
export const GET = protectedHandler(
  { permission: "REPORT_READ" },
  async ({ request }) => {
    const params = new URL(request.url).searchParams;

    const priorityParam = params.get("priority");
    if (
      priorityParam &&
      !(PRIORITY_VALUES as readonly string[]).includes(priorityParam)
    ) {
      return {
        raw: jsonError(422, "VALIDATION_FAILED", "Invalid priority.", [
          {
            field: "priority",
            message: "Must be one of LOW, NORMAL, HIGH, URGENT.",
          },
        ]),
      };
    }

    const fromParam = params.get("from");
    const toParam = params.get("to");
    const rows = await getByCreatorReport({
      from: fromParam ? new Date(fromParam) : undefined,
      to: toParam ? new Date(toParam) : undefined,
      departmentId: params.get("departmentId") ?? undefined,
      priority: priorityParam ? (priorityParam as Priority) : undefined,
    });

    if (params.get("format") === "csv") {
      const csv = toCsv(rows, [
        { key: "label", header: "Creator" },
        { key: "count", header: "Decided" },
        { key: "avgApprovalMinutes", header: "Average minutes" },
      ]);
      return {
        raw: new NextResponse(csv, {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": 'attachment; filename="by-creator.csv"',
          },
        }),
      };
    }

    return { data: rows };
  },
);
