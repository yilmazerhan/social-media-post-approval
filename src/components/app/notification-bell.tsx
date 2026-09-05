"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Bell, BellOff } from "lucide-react";
import type { NotificationDto } from "@/modules/notifications";
import { getJson, postJson, CSRF_COOKIE_NAME } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/app/empty-state";

const POLL_INTERVAL_MS = 60_000;

function entityHref(notification: NotificationDto): string | null {
  if (!notification.postId) return null;
  return notification.type === "APPROVAL_ASSIGNED"
    ? `/approvals/${notification.postId}`
    : `/posts/${notification.postId}`;
}

/** UI_UX_SPEC.md §3's shell bell — real unread count and a recent-items dropdown, polled rather than pushed (no realtime transport in this on-premise stack). */
export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationDto[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    function refreshCount() {
      getJson<{ count: number }>("/api/v1/notifications/unread-count")
        .then((result) => {
          if (!cancelled) setUnreadCount(result.count);
        })
        .catch(() => {
          /* the badge just stays at its last known value */
        });
    }
    refreshCount();
    const interval = setInterval(refreshCount, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!open || loaded) return;
    getJson<NotificationDto[]>("/api/v1/notifications?filter=all")
      .then((result) => setNotifications(result.slice(0, 10)))
      .catch(() => {
        /* dropdown just shows empty rather than an error toast for a peek widget */
      })
      .finally(() => setLoaded(true));
  }, [open, loaded]);

  function markOpened(notification: NotificationDto) {
    if (notification.readAt) return;
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === notification.id
          ? { ...n, readAt: new Date().toISOString() }
          : n,
      ),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    postJson(`/api/v1/notifications/${notification.id}/read`, undefined, {
      csrfCookieName: CSRF_COOKIE_NAME,
    }).catch(() => {
      /* already reflected locally */
    });
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={
            unreadCount > 0
              ? `Notifications (${unreadCount} unread)`
              : "Notifications"
          }
          className="relative"
        >
          <Bell aria-hidden />
          {unreadCount > 0 && (
            <span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full text-[10px] font-medium">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        {loaded && notifications.length === 0 ? (
          <EmptyState icon={BellOff} title="No notifications yet" />
        ) : (
          <div className="max-h-80 space-y-1 overflow-y-auto p-1">
            {notifications.map((notification) => {
              const href = entityHref(notification);
              const row = (
                <div
                  className={`flex flex-col gap-0.5 rounded-md p-2 text-sm ${!notification.readAt ? "bg-accent/40" : ""}`}
                >
                  <span className="font-medium">{notification.title}</span>
                  <span className="text-muted-foreground line-clamp-2">
                    {notification.body}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {format(new Date(notification.createdAt), "d MMM, HH:mm")}
                  </span>
                </div>
              );
              return href ? (
                <Link
                  key={notification.id}
                  href={href}
                  onClick={() => markOpened(notification)}
                >
                  {row}
                </Link>
              ) : (
                <button
                  key={notification.id}
                  type="button"
                  className="w-full text-left"
                  onClick={() => markOpened(notification)}
                >
                  {row}
                </button>
              );
            })}
          </div>
        )}
        <DropdownMenuSeparator />
        <Link
          href="/notifications"
          className="text-primary block p-2 text-center text-sm hover:underline"
        >
          View all notifications
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
