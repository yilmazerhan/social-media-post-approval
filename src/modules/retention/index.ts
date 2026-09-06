/**
 * Retention policies, dry-run default, cleanup — IMPLEMENTATION_PLAN.md
 * Phase 20, DATABASE.md §7.
 *
 * Public surface of this module. Other modules and route handlers import
 * from here — never from a file inside this directory directly. See
 * ARCHITECTURE.md §2 (module rules) for the boundary contract.
 */
export {
  runRetentionForTarget,
  runAllRetention,
  type RetentionTargetResult,
} from "./service";
