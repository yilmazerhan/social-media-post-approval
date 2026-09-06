/**
 * Workflow administration — API.md's `/api/v1/admin/workflow-transitions`,
 * UI_UX_SPEC.md §6's read-only "Workflow" admin section. Never a second
 * source of truth for legal transitions: this just exposes the one table
 * `state-machine.ts` already owns.
 */
import { listTransitions } from "@/modules/approvals";

export function listWorkflowTransitions() {
  return listTransitions();
}
