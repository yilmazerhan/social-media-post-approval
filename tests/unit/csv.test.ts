import { describe, expect, it } from "vitest";
import { toCsv } from "@/server/http/csv";

describe("toCsv", () => {
  it("prefixes a leading formula character with a single quote", () => {
    const csv = toCsv(
      [{ reason: "=1+1", count: 3 }],
      [
        { key: "reason", header: "Reason" },
        { key: "count", header: "Count" },
      ],
    );
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("Reason,Count");
    expect(lines[1]).toBe("'=1+1,3");
  });

  it("quotes and prefixes a value that also contains a comma", () => {
    const csv = toCsv(
      [{ reason: "@SUM(1,2)", count: 1 }],
      [
        { key: "reason", header: "Reason" },
        { key: "count", header: "Count" },
      ],
    );
    const lines = csv.trim().split("\r\n");
    expect(lines[1]).toBe('"\'@SUM(1,2)",1');
  });

  it("leaves an ordinary value untouched", () => {
    const csv = toCsv(
      [{ reason: "Off-brand tone", count: 1 }],
      [
        { key: "reason", header: "Reason" },
        { key: "count", header: "Count" },
      ],
    );
    expect(csv).toContain("Off-brand tone,1");
  });
});
