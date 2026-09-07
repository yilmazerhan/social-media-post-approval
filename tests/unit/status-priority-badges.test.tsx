import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "@/components/app/status-badge";
import { PriorityBadge } from "@/components/app/priority-badge";

describe("StatusBadge", () => {
  it("renders the label for every PostStatus — colour is never the only signal", () => {
    const statuses = [
      ["DRAFT", "Draft"],
      ["SUBMITTED", "Submitted"],
      ["IN_REVIEW", "In review"],
      ["CHANGES_REQUESTED", "Changes requested"],
      ["APPROVED", "Approved"],
      ["REJECTED", "Rejected"],
      ["CANCELLED", "Cancelled"],
      ["ARCHIVED", "Archived"],
    ] as const;

    for (const [status, label] of statuses) {
      const { unmount } = render(<StatusBadge status={status} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });
});

describe("PriorityBadge", () => {
  it("renders the label for every Priority", () => {
    const priorities = [
      ["LOW", "Low"],
      ["NORMAL", "Normal"],
      ["HIGH", "High"],
      ["URGENT", "Urgent"],
    ] as const;

    for (const [priority, label] of priorities) {
      const { unmount } = render(<PriorityBadge priority={priority} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });
});
