import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSessionContext } from "@/server/http/request-context";
import { loadAuthorizedUser, PERMISSIONS } from "@/modules/authorization";
import { EmployeeDashboard } from "./employee-dashboard";
import { ApproverDashboard } from "./approver-dashboard";
import { AdminDashboard } from "./admin-dashboard";

export const metadata: Metadata = { title: "Dashboard — Content Approval" };

const ADMIN_PERMISSION_KEYS = PERMISSIONS.filter(
  (p) => p.category === "administration",
).map((p) => p.key);

/**
 * UI_UX_SPEC.md §6 — one dashboard per role, chosen the same way the shell
 * picks nav items: by granted permission, never by a raw role name, so a
 * user with several roles' permissions still sees the most privileged view.
 */
export default async function DashboardPage() {
  const sessionContext = await getServerSessionContext();
  if (!sessionContext) {
    redirect("/login");
  }
  const { user } = sessionContext;
  const authz = await loadAuthorizedUser(user.id);

  if (ADMIN_PERMISSION_KEYS.some((key) => authz.permissions.has(key))) {
    return <AdminDashboard />;
  }
  if (authz.permissions.has("APPROVAL_READ")) {
    return <ApproverDashboard user={authz} />;
  }
  return <EmployeeDashboard userId={user.id} />;
}
