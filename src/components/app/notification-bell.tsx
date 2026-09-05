"use client";

import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/app/empty-state";

/**
 * The widget UI_UX_SPEC.md §3 draws in the shell — the Notifications
 * module itself (unread count, feed, mark-as-read) is Phase 16. Rendering
 * it now as a working, honest empty state avoids both an unreachable nav
 * item and a fake unread count.
 */
export function NotificationBell() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Notifications"
          className="relative"
        >
          <Bell aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <EmptyState icon={BellOff} title="No notifications yet" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
