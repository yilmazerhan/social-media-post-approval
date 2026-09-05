import type { Metadata } from "next";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata: Metadata = { title: "My Posts — Content Approval" };

export default function PostsPage() {
  return (
    <ComingSoon
      title="My Posts"
      breadcrumbs={[{ label: "My Posts" }]}
      phaseNote="Post listing, filters and the DataTable arrive with the rest of the post lifecycle in Phase 9/10."
    />
  );
}
