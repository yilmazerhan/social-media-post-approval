import type { Metadata } from "next";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata: Metadata = { title: "Notifications — Content Approval" };

export default function NotificationsPage() {
  return (
    <ComingSoon
      title="Notifications"
      breadcrumbs={[{ label: "Notifications" }]}
      phaseNote="The notification feed, mark-as-read and preferences arrive in Phase 16."
    />
  );
}
