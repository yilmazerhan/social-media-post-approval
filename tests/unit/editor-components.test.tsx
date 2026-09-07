import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReadinessChecklist } from "@/components/app/editor/readiness-checklist";
import { AutosaveStatusChip } from "@/components/app/editor/autosave-status";
import { ChangesRequestedBanner } from "@/components/app/editor/changes-requested-banner";
import { SubmissionConfirmation } from "@/components/app/editor/submission-confirmation";
import type { ReadinessItem } from "@/modules/posts";

const items: ReadinessItem[] = [
  { key: "title", label: "Title provided", passed: true },
  { key: "department", label: "Department required", passed: false },
];

describe("ReadinessChecklist", () => {
  it("renders every item and focuses the field when a failing item is clicked", async () => {
    const onFocusField = vi.fn();
    render(<ReadinessChecklist items={items} onFocusField={onFocusField} />);

    expect(screen.getByText("Title provided")).toBeInTheDocument();
    const failingButton = screen.getByRole("button", {
      name: "Department required",
    });
    await userEvent.click(failingButton);
    expect(onFocusField).toHaveBeenCalledWith("department");
  });

  it("renders failing items as plain text when no focus handler is given", () => {
    render(<ReadinessChecklist items={items} />);
    expect(
      screen.queryByRole("button", { name: "Department required" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Department required")).toBeInTheDocument();
  });
});

describe("AutosaveStatusChip", () => {
  it("shows Saving…, Saved HH:MM, and the failure message for each status", () => {
    const { rerender } = render(
      <AutosaveStatusChip status="saving" savedAt={null} />,
    );
    expect(screen.getByText("Saving…")).toBeInTheDocument();

    rerender(
      <AutosaveStatusChip
        status="saved"
        savedAt={new Date(2026, 0, 1, 9, 5)}
      />,
    );
    expect(screen.getByText(/Saved/)).toBeInTheDocument();

    rerender(<AutosaveStatusChip status="error" savedAt={null} />);
    expect(screen.getByText("Save failed — retrying")).toBeInTheDocument();
  });
});

describe("ChangesRequestedBanner", () => {
  it("shows the reviewer's comment, author, and version", () => {
    render(
      <ChangesRequestedBanner
        banner={{
          comment: "Tighten the second paragraph.",
          actorName: "Jane Manager",
          createdAt: new Date().toISOString(),
          versionNumber: 2,
        }}
      />,
    );
    expect(screen.getByText(/version 2/)).toBeInTheDocument();
    expect(
      screen.getByText(/Tighten the second paragraph\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/Jane Manager/)).toBeInTheDocument();
  });
});

describe("SubmissionConfirmation", () => {
  it("shows the reference, version and assignee, with actions to view and go back", () => {
    render(
      <SubmissionConfirmation
        reference="POST-2026-000412"
        versionNumber={3}
        assigneeName="Jane Manager"
        postId="post-1"
      />,
    );
    expect(
      screen.getByText("Your post has been submitted for approval."),
    ).toBeInTheDocument();
    expect(screen.getByText(/POST-2026-000412/)).toBeInTheDocument();
    expect(screen.getByText(/Version 3/)).toBeInTheDocument();
    expect(screen.getByText(/Jane Manager/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View post" })).toHaveAttribute(
      "href",
      "/posts/post-1",
    );
    expect(
      screen.getByRole("link", { name: "Back to My Posts" }),
    ).toHaveAttribute("href", "/posts");
  });
});
