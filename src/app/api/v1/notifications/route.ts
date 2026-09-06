import {
  listNotifications,
  type NotificationFilter,
} from "@/modules/notifications";
import { protectedHandler } from "@/server/http/handler";

const FILTERS: readonly NotificationFilter[] = ["all", "unread", "mentions"];

/** API.md's `GET /notifications` (`?filter=unread|mentions`). No `permission` option: always scoped to the caller's own notifications. */
export const GET = protectedHandler({}, async ({ request, user }) => {
  const raw = new URL(request.url).searchParams.get("filter");
  const filter: NotificationFilter = (
    raw && (FILTERS as readonly string[]).includes(raw) ? raw : "all"
  ) as NotificationFilter;

  const notifications = await listNotifications(user.id, filter);
  return { data: notifications };
});
