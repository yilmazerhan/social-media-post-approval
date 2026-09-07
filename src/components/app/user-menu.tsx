"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { KeyRound, LogOut, MonitorSmartphone } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChangePasswordDialog } from "@/components/app/change-password-dialog";
import { CSRF_COOKIE_NAME, postJson } from "@/lib/api-client";
import type { AuthProvider } from "@/generated/prisma/client";

function initials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

export function UserMenu({
  displayName,
  email,
  authProvider,
}: {
  displayName: string;
  email: string;
  authProvider: AuthProvider;
}) {
  const router = useRouter();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  async function handleLogout() {
    await postJson(
      "/api/v1/auth/logout",
      {},
      { csrfCookieName: CSRF_COOKIE_NAME },
    ).catch(() => undefined);
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-9 gap-2 px-2">
            <Avatar className="size-7">
              <AvatarFallback>{initials(displayName)}</AvatarFallback>
            </Avatar>
            {/* Screen readers always get the name; sighted users only see
                it at sm+ — never a visible name that mismatches the
                accessible one (WCAG 2.5.3). */}
            <span className="sr-only text-sm font-medium sm:not-sr-only">
              {displayName}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span className="font-medium">{displayName}</span>
              <span className="text-muted-foreground text-xs font-normal">
                {email}
              </span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {authProvider === "LOCAL" && (
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                setChangePasswordOpen(true);
              }}
            >
              <KeyRound aria-hidden />
              Change password
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link href="/account/sessions">
              <MonitorSmartphone aria-hidden />
              Sessions
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={handleLogout}>
            <LogOut aria-hidden />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {authProvider === "LOCAL" && (
        <ChangePasswordDialog
          open={changePasswordOpen}
          onOpenChange={setChangePasswordOpen}
        />
      )}
    </>
  );
}
