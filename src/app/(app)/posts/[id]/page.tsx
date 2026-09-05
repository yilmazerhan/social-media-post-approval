import type { Metadata } from "next";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata: Metadata = { title: "Post — Content Approval" };

/**
 * Placeholder so links into a specific post (the dashboard's recent
 * activity feed) resolve to something honest rather than a 404 — the real
 * overview/preview/versions/history/comments/activity tabs are Phase 10.
 */
export default function PostDetailsPage() {
  return (
    <ComingSoon
      title="Post details"
      breadcrumbs={[{ label: "My Posts", href: "/posts" }, { label: "Post" }]}
      phaseNote="Post details — overview, preview, versions, approval history, comments and activity — arrive in Phase 10."
    />
  );
}
