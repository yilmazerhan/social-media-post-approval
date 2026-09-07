import { listNotificationVolumeSummary } from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

/** Read-only volume-by-type summary — UI_UX_SPEC.md §6's minimal "Notifications" admin section; per-user preferences remain Phase 16's own self-service page. */
export const GET = protectedHandler(
  { permission: "SETTINGS_MANAGE" },
  async () => {
    const summary = await listNotificationVolumeSummary();
    return { data: summary };
  },
);
