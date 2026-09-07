import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SLAIndicator } from "@/components/app/sla-indicator";

describe("SLAIndicator", () => {
  it("shows the remainder text and the correct progress value below 75%", () => {
    render(<SLAIndicator percentElapsed={40} remainderText="Due in 6h" />);
    expect(screen.getByText("Due in 6h")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "40",
    );
  });

  it("still renders the text at and above 100% (overdue)", () => {
    render(<SLAIndicator percentElapsed={140} remainderText="Overdue by 2h" />);
    expect(screen.getByText("Overdue by 2h")).toBeInTheDocument();
    // The bar itself is visually clamped to 100% even though elapsed exceeds it.
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
  });
});
