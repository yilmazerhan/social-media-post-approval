import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/app/data-table";

interface Row {
  id: string;
  title: string;
  priority: string;
}

const columns: ColumnDef<Row>[] = [
  { accessorKey: "title", header: "Title" },
  { accessorKey: "priority", header: "Priority" },
];

function rows(count: number): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i),
    title: `Post ${String(i).padStart(2, "0")}`,
    priority: i % 2 === 0 ? "LOW" : "HIGH",
  }));
}

describe("DataTable", () => {
  it("renders every row when under one page", () => {
    render(<DataTable columns={columns} data={rows(3)} />);
    expect(screen.getByText("Post 00")).toBeInTheDocument();
    expect(screen.getByText("Post 02")).toBeInTheDocument();
  });

  it("shows the empty state when there is no data", () => {
    render(
      <DataTable columns={columns} data={[]} emptyMessage="No posts yet." />,
    );
    expect(screen.getByText("No posts yet.")).toBeInTheDocument();
  });

  it("sorts a column when its header is clicked", async () => {
    render(<DataTable columns={columns} data={rows(3)} />);
    const table = screen.getByRole("table");

    await userEvent.click(screen.getByRole("button", { name: /Title/ }));

    const cells = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell")[0]?.textContent);
    expect(cells).toEqual(["Post 00", "Post 01", "Post 02"]);
  });

  it("paginates beyond the default page size and disables Previous on page 1", async () => {
    render(<DataTable columns={columns} data={rows(15)} />);
    expect(screen.getByText("Post 00")).toBeInTheDocument();
    expect(screen.queryByText("Post 12")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Post 12")).toBeInTheDocument();
  });

  it("hides a column via the Columns menu", async () => {
    render(<DataTable columns={columns} data={rows(2)} />);
    expect(
      screen.getByRole("columnheader", { name: /Priority/ }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Columns" }));
    await userEvent.click(
      screen.getByRole("menuitemcheckbox", { name: "Priority" }),
    );

    expect(
      screen.queryByRole("columnheader", { name: /Priority/ }),
    ).not.toBeInTheDocument();
  });
});
