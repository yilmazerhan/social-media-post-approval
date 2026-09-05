/**
 * Append-only audit log writer and query. See DATABASE.md §7, SECURITY.md.
 *
 * Public surface of this module. Other modules and route handlers import
 * from here — never from a file inside this directory directly. See
 * ARCHITECTURE.md §2 (module rules) for the boundary contract.
 */
export { writeAudit, type AuditEventInput } from "./audit-writer";
