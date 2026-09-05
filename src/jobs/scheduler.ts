/**
 * Evaluates JobSchedule rows on each tick and enqueues due jobs. Real
 * schedule evaluation needs the database (Phase 3) and job types (as
 * each module adds them); this is the entry point the worker calls.
 * See ARCHITECTURE.md §7.
 */
export {};
