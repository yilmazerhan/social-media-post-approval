import { listWorkflowTransitions } from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

/** Read-only render of `state-machine.ts`'s legal-transition table — UI_UX_SPEC.md §6's "Workflow" admin section. */
export const GET = protectedHandler(
  { permission: "SETTINGS_MANAGE" },
  async () => {
    return { data: listWorkflowTransitions() };
  },
);
