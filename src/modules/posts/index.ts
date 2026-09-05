/**
 * Posts, immutable versions and editor validation. See DATABASE.md §4, ARCHITECTURE.md §4.
 *
 * Public surface of this module. Other modules and route handlers import
 * from here — never from a file inside this directory directly. See
 * ARCHITECTURE.md §2 (module rules) for the boundary contract.
 */
export {
  getEmployeeDashboard,
  getContentVolumeSeries,
  type EmployeeDashboard,
  type EmployeePostCounts,
  type PostActivityEntry,
  type ContentVolumePoint,
} from "./dashboard";
