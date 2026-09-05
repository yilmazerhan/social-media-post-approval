import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileText } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";

describe("EmptyState", () => {
  it("renders the explanation and an optional action", () => {
    render(
      <EmptyState
        icon={FileText}
        title="No posts yet — create your first post"
        action={<button type="button">Create post</button>}
      />,
    );
    expect(
      screen.getByText("No posts yet — create your first post"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create post" }),
    ).toBeInTheDocument();
  });
});

describe("ErrorState", () => {
  it("shows the message, a traceId, and calls onRetry when clicked", async () => {
    const onRetry = vi.fn();
    render(
      <ErrorState
        message="Something went wrong."
        traceId="01J8Z-test"
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Something went wrong.",
    );
    expect(screen.getByText(/01J8Z-test/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("omits the Retry button when no onRetry is given", () => {
    render(<ErrorState message="Something went wrong." />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
