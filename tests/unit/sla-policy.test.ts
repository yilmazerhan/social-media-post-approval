import { describe, expect, it } from "vitest";
import { computeDueDates } from "@/modules/sla";

describe("computeDueDates", () => {
  it("computes dueAt from durationMinutes and warningAt from the threshold percent", () => {
    const assignedAt = new Date("2026-01-01T00:00:00.000Z");
    const { dueAt, warningAt } = computeDueDates(assignedAt, {
      durationMinutes: 1440,
      warningThresholdPercent: 75,
    });
    expect(dueAt.toISOString()).toBe("2026-01-02T00:00:00.000Z");
    // 75% of 1440 minutes = 1080 minutes = 18 hours.
    expect(warningAt.toISOString()).toBe("2026-01-01T18:00:00.000Z");
  });

  it("handles a 100% warning threshold as coinciding with the due date", () => {
    const assignedAt = new Date("2026-01-01T00:00:00.000Z");
    const { dueAt, warningAt } = computeDueDates(assignedAt, {
      durationMinutes: 60,
      warningThresholdPercent: 100,
    });
    expect(warningAt.getTime()).toBe(dueAt.getTime());
  });
});
