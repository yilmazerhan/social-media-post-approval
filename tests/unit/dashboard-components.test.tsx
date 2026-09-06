import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FileText } from "lucide-react";
import { StatCard } from "@/components/app/stat-card";
import { ActivityItem } from "@/components/app/activity-item";
import { HealthTile } from "@/components/app/health-tile";
import { ContentVolumeSparkline } from "@/components/app/content-volume-sparkline";

describe("StatCard", () => {
  it("renders the label and value", () => {
    render(<StatCard label="Drafts" value={3} icon={FileText} />);
    expect(screen.getByText("Drafts")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("wraps the card in a link when href is given", () => {
    render(
      <StatCard
        label="Pending approvals"
        value={1}
        icon={FileText}
        href="/approvals"
      />,
    );
    expect(screen.getByRole("link")).toHaveAttribute("href", "/approvals");
  });

  it("renders as a plain card with no link when href is omitted", () => {
    render(<StatCard label="Due soon" value={0} icon={FileText} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("ActivityItem", () => {
  it("renders the actor, the humanized action, and a link to the post", () => {
    render(
      <ActivityItem
        actorName="Jane Manager"
        action="REQUEST_CHANGES"
        postTitle="Introducing Kron PAM 4.0"
        postHref="/posts/abc-123"
        createdAt={new Date(Date.now() - 60_000)}
      />,
    );
    expect(screen.getByText("Jane Manager")).toBeInTheDocument();
    expect(screen.getByText("requested changes on")).toBeInTheDocument();
    const link = screen.getByRole("link", {
      name: "Introducing Kron PAM 4.0",
    });
    expect(link).toHaveAttribute("href", "/posts/abc-123");
  });
});

describe("HealthTile", () => {
  it("shows the status label and detail for a healthy tile", () => {
    render(
      <HealthTile
        label="Database"
        status="healthy"
        detail="Connected."
        href="/admin"
      />,
    );
    expect(screen.getByText("Database")).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();
    expect(screen.getByText("Connected.")).toBeInTheDocument();
  });

  it("shows a Down status for a failed dependency", () => {
    render(
      <HealthTile
        label="Storage"
        status="down"
        detail="Upload directory is missing or not writable."
        href="/admin"
      />,
    );
    expect(screen.getByText("Down")).toBeInTheDocument();
  });
});

describe("ContentVolumeSparkline", () => {
  it("summarizes the total across the window for screen readers", () => {
    render(
      <ContentVolumeSparkline
        points={[
          { date: "2026-01-01", count: 2 },
          { date: "2026-01-02", count: 0 },
          { date: "2026-01-03", count: 1 },
        ]}
      />,
    );
    expect(
      screen.getByText("3 posts submitted in the last 3 days."),
    ).toBeInTheDocument();
  });

  it("uses singular phrasing for a single post", () => {
    render(
      <ContentVolumeSparkline points={[{ date: "2026-01-01", count: 1 }]} />,
    );
    expect(
      screen.getByText("1 post submitted in the last 1 days."),
    ).toBeInTheDocument();
  });
});
