/**
 * Notification writes, reads, and per-type preferences — DATABASE.md §6.
 *
 * Public surface of this module. Other modules and route handlers import
 * from here — never from a file inside this directory directly. See
 * ARCHITECTURE.md §2 (module rules) for the boundary contract.
 */
export {
  writeNotification,
  enqueueGroupFanout,
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  getPreferences,
  updatePreferences,
  NOTIFICATION_TYPES,
  type WriteNotificationInput,
  type NotificationFilter,
} from "./service";
export {
  updatePreferencesSchema,
  type UpdatePreferencesInput,
} from "./validation";
export type { NotificationDto, NotificationPreferenceDto } from "./types";
