"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { NAV_ICONS, type SidebarNavItem } from "@/components/app/sidebar";
import { NotificationBell } from "@/components/app/notification-bell";
import { UserMenu } from "@/components/app/user-menu";
import type { AuthProvider } from "@/generated/prisma/client";

export function TopBar({
  navItems,
  displayName,
  email,
  authProvider,
}: {
  navItems: SidebarNavItem[];
  displayName: string;
  email: string;
  authProvider: AuthProvider;
}) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-3">
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Open navigation"
          onClick={() => setMobileNavOpen(true)}
        >
          <Menu aria-hidden />
        </Button>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="text-primary size-5" aria-hidden />
              Content Approval
            </SheetTitle>
          </SheetHeader>
          <nav aria-label="Primary" className="flex flex-col gap-1 px-2 pb-4">
            {navItems.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = NAV_ICONS[item.iconId];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileNavOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>

      <Link
        href="/dashboard"
        className="hidden items-center gap-2 font-semibold lg:flex"
      >
        <ShieldCheck className="text-primary size-5" aria-hidden />
        Content Approval
      </Link>

      <div className="max-w-md flex-1">
        <Input
          type="search"
          placeholder="Search posts…"
          aria-label="Search"
          disabled
        />
      </div>

      <div className="ml-auto flex items-center gap-1">
        <NotificationBell />
        <UserMenu
          displayName={displayName}
          email={email}
          authProvider={authProvider}
        />
      </div>
    </header>
  );
}
