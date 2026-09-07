import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSessionContext } from "@/server/http/request-context";
import {
  loadAuthorizedUser,
  serializeGrants,
  PERMISSIONS,
} from "@/modules/authorization";
import { PageHeader } from "@/components/app/page-header";
import { AdminShell } from "./admin-shell";

export const metadata: Metadata = {
  title: "Administration — Content Approval",
};

/**
 * Same filter `(app)/layout.tsx` uses to decide whether "Administration"
 * appears in the sidebar at all — duplicated here (not exported from the
 * layout) because this is also the server-side gate on the route itself.
 * CLAUDE.md's hard constraint #6: "Authorization is server-side. Hiding a
 * button is not a security control." — the layout only ever hid the nav
 * item; a visitor without any administration permission who requested
 * `/admin` directly still reached this page. `notFound()` matches the
 * pattern `/approvals/[postId]` already uses for a read-authorization
 * failure — a plain 404 rather than a 403, so the route doesn't confirm
 * to an unauthorized visitor that it exists.
 */
const ADMIN_PERMISSION_KEYS = PERMISSIONS.filter(
  (p) => p.category === "administration",
).map((p) => p.key);

export default async function AdminPage() {
  const sessionContext = await getServerSessionContext();
  if (!sessionContext) redirect("/login");

  const authz = await loadAuthorizedUser(sessionContext.user.id);
  if (!ADMIN_PERMISSION_KEYS.some((key) => authz.permissions.has(key))) {
    notFound();
  }

  const grants = serializeGrants(authz);

  return (
    <div>
      <PageHeader
        title="Administration"
        breadcrumbs={[{ label: "Administration" }]}
      />
      <AdminShell grants={grants} />
    </div>
  );
}
