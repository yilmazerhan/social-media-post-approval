/**
 * SLA policy resolution and due/warning math — IMPLEMENTATION_PLAN.md
 * Phase 19, DATABASE.md §5.
 *
 * Public surface of this module. Other modules and route handlers import
 * from here — never from a file inside this directory directly. See
 * ARCHITECTURE.md §2 (module rules) for the boundary contract.
 */
export { resolveSlaPolicy, computeDueDates, type DueDates } from "./policy";
