import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders its label and responds to a click", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save draft</Button>);

    const button = screen.getByRole("button", { name: "Save draft" });
    await userEvent.click(button);

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("disables interaction when the disabled prop is set", () => {
    render(<Button disabled>Submit</Button>);
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
  });
});
