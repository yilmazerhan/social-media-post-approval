/**
 * Daily approval digest — IMPLEMENTATION_PLAN.md Phase 18.
 *
 * Public surface of this module. Other modules and route handlers import
 * from here — never from a file inside this directory directly. See
 * ARCHITECTURE.md §2 (module rules) for the boundary contract.
 */
export { runDailyDigest, type RunDailyDigestResult } from "./service";
