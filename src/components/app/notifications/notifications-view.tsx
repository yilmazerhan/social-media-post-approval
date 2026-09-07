"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { format, isToday, isYesterday } from "date-fns";
import { BellOff } from "lucide-react";
import type {
  NotificationDto,
  NotificationFilter,
  NotificationPreferenceDto,
} from "@/modules/notifications";
import {
  getJson,
  postJson,
  patchJson,
  CSRF_COOKIE_NAME,
} from "@/lib/api-client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";
import { useToast } from "@/hooks/use-toast";

/** UI_UX_SPEC.md §6: tabs All/Unread/Mentions, grouped by day, mark-all, and per-type in-app/email preferences. */

const TYPE_LABELS: Record<NotificationDto["type"], string> = {
  POST_SUBMITTED: "Submissions",
  APPROVAL_ASSIGNED: "Approval requests",
  CHANGES_REQUESTED: "Changes requested",
  POST_APPROVED: "Approvals",
  POST_REJECTED: "Rejections",
  COMMENT_MENTION: "Mentions",
  COMMENT_ADDED: "Comments",
  SLA_WARNING: "SLA warnings",
  SLA_OVERDUE: "SLA overdue",
  ESCALATION: "Escalations",
};

/** APPROVAL_ASSIGNED's actionable destination is the review screen; everything else links to the post itself. */
function entityHref(notification: NotificationDto): string | null {
  if (!notification.postId) return null;
  return notification.type === "APPROVAL_ASSIGNED"
    ? `/approvals/${notification.postId}`
    : `/posts/${notification.postId}`;
}

function dayLabel(date: Date): string {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "d MMMM yyyy");
}

function groupByDay(
  notifications: NotificationDto[],
): { label: string; items: NotificationDto[] }[] {
  const groups: { label: string; items: NotificationDto[] }[] = [];
  for (const notification of notifications) {
    const label = dayLabel(new Date(notification.createdAt));
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.items.push(notification);
    } else {
      groups.push({ label, items: [notification] });
    }
  }
  return groups;
}

function NotificationRow({
  notification,
  onOpen,
}: {
  notification: NotificationDto;
  onOpen: (notification: NotificationDto) => void;
}) {
  const href = entityHref(notification);
  const unread = !notification.readAt;

  const content = (
    <div
      className={`flex flex-col gap-0.5 rounded-md border p-3 ${unread ? "bg-accent/40 border-accent" : "border-transparent"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{notification.title}</span>
        {unread && (
          <span
            aria-label="Unread"
            className="bg-primary size-2 shrink-0 rounded-full"
          />
        )}
      </div>
      <p className="text-muted-foreground text-sm">{notification.body}</p>
      <span className="text-muted-foreground text-xs">
        {format(new Date(notification.createdAt), "d MMM yyyy, HH:mm")}
      </span>
    </div>
  );

  if (!href) {
    return (
      <button
        type="button"
        className="text-left"
        onClick={() => onOpen(notification)}
      >
        {content}
      </button>
    );
  }

  return (
    <Link href={href} onClick={() => onOpen(notification)}>
      {content}
    </Link>
  );
}

function PreferencesPanel({
  preferences,
  onToggle,
}: {
  preferences: NotificationPreferenceDto[];
  onToggle: (
    type: NotificationDto["type"],
    field: "inAppEnabled" | "emailEnabled",
    value: boolean,
  ) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="p-2 text-left font-medium">Notification</th>
            <th className="p-2 text-left font-medium">In-app</th>
            <th className="p-2 text-left font-medium">Email</th>
          </tr>
        </thead>
        <tbody>
          {preferences.map((pref) => (
            <tr key={pref.type} className="border-b last:border-0">
              <td className="p-2">{TYPE_LABELS[pref.type]}</td>
              <td className="p-2">
                <input
                  type="checkbox"
                  aria-label={`${TYPE_LABELS[pref.type]} in-app`}
                  checked={pref.inAppEnabled}
                  onChange={(e) =>
                    onToggle(pref.type, "inAppEnabled", e.target.checked)
                  }
                />
              </td>
              <td className="p-2">
                <input
                  type="checkbox"
                  aria-label={`${TYPE_LABELS[pref.type]} email`}
                  checked={pref.emailEnabled}
                  onChange={(e) =>
                    onToggle(pref.type, "emailEnabled", e.target.checked)
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function NotificationsView() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [notifications, setNotifications] = useState<NotificationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState<NotificationPreferenceDto[]>(
    [],
  );

  const load = useCallback((nextFilter: NotificationFilter) => {
    setLoading(true);
    getJson<NotificationDto[]>(`/api/v1/notifications?filter=${nextFilter}`)
      .then(setNotifications)
      .catch(() =>
        toast({
          title: "Couldn't load notifications.",
          variant: "destructive",
        }),
      )
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast identity is stable enough here.
  }, []);

  useEffect(() => {
    load(filter);
  }, [filter, load]);

  useEffect(() => {
    getJson<NotificationPreferenceDto[]>("/api/v1/notifications/preferences")
      .then(setPreferences)
      .catch(() =>
        toast({ title: "Couldn't load preferences.", variant: "destructive" }),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast identity is stable enough here.
  }, []);

  function markOpened(notification: NotificationDto) {
    if (notification.readAt) return;
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === notification.id
          ? { ...n, readAt: new Date().toISOString() }
          : n,
      ),
    );
    postJson(`/api/v1/notifications/${notification.id}/read`, undefined, {
      csrfCookieName: CSRF_COOKIE_NAME,
    }).catch(() => {
      /* the row already shows read locally; a background retry isn't worth surfacing */
    });
  }

  async function markAllRead() {
    await postJson("/api/v1/notifications/read-all", undefined, {
      csrfCookieName: CSRF_COOKIE_NAME,
    });
    // Re-fetch rather than patch in place: the "Unread" tab's list must
    // actually empty out once everything in it is read.
    load(filter);
    toast({ title: "All notifications marked as read." });
  }

  function togglePreference(
    type: NotificationDto["type"],
    field: "inAppEnabled" | "emailEnabled",
    value: boolean,
  ) {
    const next = preferences.map((p) =>
      p.type === type ? { ...p, [field]: value } : p,
    );
    setPreferences(next);
    const updated = next.find((p) => p.type === type);
    if (!updated) return;
    patchJson("/api/v1/notifications/preferences", {
      preferences: [{ type, [field]: value }],
    }).catch(() =>
      toast({
        title: "Couldn't save that preference.",
        variant: "destructive",
      }),
    );
  }

  const groups = groupByDay(notifications);
  const hasUnread = notifications.some((n) => !n.readAt);

  return (
    <div className="space-y-6">
      <Tabs
        value={filter}
        onValueChange={(v) => setFilter(v as NotificationFilter)}
      >
        <div className="flex items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="unread">Unread</TabsTrigger>
            <TabsTrigger value="mentions">Mentions</TabsTrigger>
          </TabsList>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={markAllRead}
            disabled={!hasUnread}
          >
            Mark all as read
          </Button>
        </div>

        <TabsContent value={filter} className="space-y-4">
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : groups.length === 0 ? (
            <EmptyState icon={BellOff} title="No notifications here." />
          ) : (
            groups.map((group) => (
              <div key={group.label} className="space-y-2">
                <h2 className="text-muted-foreground text-sm font-medium">
                  {group.label}
                </h2>
                <div className="space-y-1">
                  {group.items.map((notification) => (
                    <NotificationRow
                      key={notification.id}
                      notification={notification}
                      onOpen={markOpened}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>

      <div className="space-y-2">
        <h2 className="text-sm font-medium">Preferences</h2>
        <PreferencesPanel
          preferences={preferences}
          onToggle={togglePreference}
        />
      </div>
    </div>
  );
}
