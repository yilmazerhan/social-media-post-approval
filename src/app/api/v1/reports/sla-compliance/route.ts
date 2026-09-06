import type { Priority } from "@/generated/prisma/client";
import { NextResponse } from "next/server";
import { getSlaComplianceReport, toCsv } from "@/modules/reports";
import { protectedHandler } from "@/server/http/handler";
import { jsonError } from "@/server/http/envelope";

const PRIORITY_VALUES: readonly Priority[] = [
  "LOW",
  "NORMAL",
  "HIGH",
  "URGENT",
];

/** `?from=&to=&departmentId=&priority=&format=json|csv` — API.md's `/reports/sla-compliance`. */
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
    const report = await getSlaComplianceReport({
      from: fromParam ? new Date(fromParam) : undefined,
      to: toParam ? new Date(toParam) : undefined,
      departmentId: params.get("departmentId") ?? undefined,
      priority: priorityParam ? (priorityParam as Priority) : undefined,
    });

    if (params.get("format") === "csv") {
      const csv = toCsv(
        [
          { metric: "Decided", value: report.decided },
          { metric: "On time", value: report.onTime },
          {
            metric: "Compliance percent",
            value: report.compliancePercent ?? "",
          },
        ],
        [
          { key: "metric", header: "Metric" },
          { key: "value", header: "Value" },
        ],
      );
      return {
        raw: new NextResponse(csv, {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": 'attachment; filename="sla-compliance.csv"',
          },
        }),
      };
    }

    return { data: report };
  },
);
