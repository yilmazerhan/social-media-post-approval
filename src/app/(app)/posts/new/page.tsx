import type { Metadata } from "next";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata: Metadata = { title: "Create post — Content Approval" };

export default function CreatePostPage() {
  return (
    <ComingSoon
      title="Create post"
      breadcrumbs={[{ label: "My Posts", href: "/posts" }, { label: "Create" }]}
      phaseNote="The Post Editor — the CREATE → PREVIEW → VALIDATE → SUBMIT hero screen — is Phase 8."
    />
  );
}
