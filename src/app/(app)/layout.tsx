import { redirect } from "next/navigation";
import { getServerSessionContext } from "@/server/http/request-context";
import { loadAuthorizedUser, PERMISSIONS } from "@/modules/authorization";
import type { SidebarNavItem } from "@/components/app/sidebar";
import { SidebarNav } from "@/components/app/sidebar";
import { TopBar } from "@/components/app/top-bar";
import { Toaster } from "@/components/ui/toaster";

/**
 * The authenticated shell — UI_UX_SPEC.md §3. Navigation is role-aware:
 * each item's permission is resolved server-side (never trust the client
 * to decide what it may see) and only items the user is actually granted
 * are ever sent down. Items carry an `iconId` rather than the icon
 * component itself — a component reference is a function, and a Server
 * Component can't pass a function to a Client Component.
 */
const ADMIN_PERMISSION_KEYS = PERMISSIONS.filter(
  (p) => p.category === "administration",
).map((p) => p.key);

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessionContext = await getServerSessionContext();
  if (!sessionContext) {
    redirect("/login");
  }
  const { user } = sessionContext;
  const authz = await loadAuthorizedUser(user.id);

  const navItems: SidebarNavItem[] = [
    { label: "Dashboard", href: "/dashboard", iconId: "dashboard" },
    ...(authz.permissions.has("POST_READ_OWN")
      ? [{ label: "My Posts", href: "/posts", iconId: "posts" as const }]
      : []),
    ...(authz.permissions.has("POST_CREATE")
      ? [{ label: "Create", href: "/posts/new", iconId: "create" as const }]
      : []),
    ...(authz.permissions.has("APPROVAL_READ")
      ? [
          {
            label: "Approvals",
            href: "/approvals",
            iconId: "approvals" as const,
          },
        ]
      : []),
    {
      label: "Notifications",
      href: "/notifications",
      iconId: "notifications",
    },
    ...(authz.permissions.has("REPORT_READ")
      ? [{ label: "Reports", href: "/reports", iconId: "reports" as const }]
      : []),
    ...(ADMIN_PERMISSION_KEYS.some((key) => authz.permissions.has(key))
      ? [
          {
            label: "Administration",
            href: "/admin",
            iconId: "admin" as const,
          },
        ]
      : []),
  ];

  return (
    <div className="flex h-screen">
      <div className="hidden lg:block">
        <SidebarNav items={navItems} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          navItems={navItems}
          displayName={user.displayName}
          email={user.email}
          authProvider={user.authProvider}
        />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
