"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  PlusCircle,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Nav items are built server-side (the (app) layout resolves permissions
 * there) but a LucideIcon component reference is a function — React
 * Server Components can't serialize a function across the server/client
 * boundary. So the layout only ever sends this small string id, and the
 * client (this file) does the id -> icon lookup itself.
 */
export const NAV_ICONS = {
  dashboard: LayoutDashboard,
  posts: FileText,
  create: PlusCircle,
  approvals: ClipboardCheck,
  notifications: Bell,
  reports: BarChart3,
  admin: ShieldCheck,
} as const satisfies Record<string, LucideIcon>;

export type NavIconId = keyof typeof NAV_ICONS;

export interface SidebarNavItem {
  label: string;
  href: string;
  iconId: NavIconId;
}

const COLLAPSE_STORAGE_KEY = "ca-sidebar-collapsed";

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ items }: { items: SidebarNavItem[] }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_STORAGE_KEY) === "true");
    } catch {
      // Private browsing or storage blocked — default (expanded) stands.
    }
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next));
    } catch {
      // Nothing to persist to — the in-memory state for this visit still works.
    }
  }

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "flex h-full flex-col justify-between border-r py-3 transition-[width]",
        collapsed ? "w-16" : "w-56",
      )}
    >
      <ul className="flex flex-col gap-1 px-2">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = NAV_ICONS[item.iconId];
          const link = (
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                collapsed && "justify-center",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
          return (
            <li key={item.href}>
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              ) : (
                link
              )}
            </li>
          );
        })}
      </ul>

      <div className="px-2">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-pressed={collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "text-muted-foreground hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm",
            collapsed && "justify-center",
          )}
        >
          {collapsed ? (
            <ChevronRight className="size-4" aria-hidden />
          ) : (
            <>
              <ChevronLeft className="size-4" aria-hidden />
              <span aria-hidden>Collapse</span>
            </>
          )}
        </button>
      </div>
    </nav>
  );
}
