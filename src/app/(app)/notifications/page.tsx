import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSessionContext } from "@/server/http/request-context";
import { PageHeader } from "@/components/app/page-header";
import { NotificationsView } from "@/components/app/notifications/notifications-view";

export const metadata: Metadata = { title: "Notifications — Content Approval" };

export default async function NotificationsPage() {
  const sessionContext = await getServerSessionContext();
  if (!sessionContext) redirect("/login");

  return (
    <div>
      <PageHeader
        title="Notifications"
        breadcrumbs={[{ label: "Notifications" }]}
      />
      <NotificationsView />
    </div>
  );
}
