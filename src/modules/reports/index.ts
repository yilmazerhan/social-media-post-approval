/**
 * Reporting aggregates and CSV export. See API.md.
 *
 * Public surface of this module. Other modules and route handlers import
 * from here — never from a file inside this directory directly. See
 * ARCHITECTURE.md §2 (module rules) for the boundary contract.
 */
export type { ReportFilters } from "./filters";
export {
  getSummaryReport,
  getThroughputReport,
  getApprovalTimeReport,
  getSlaComplianceReport,
  getByDepartmentReport,
  getByCreatorReport,
  getByApproverReport,
  getRejectionsReport,
  type SummaryReport,
  type ThroughputPoint,
  type ApprovalTimeReport,
  type SlaComplianceReport,
  type GroupedVolumeRow,
  type RejectionReasonRow,
} from "./service";
export { toCsv } from "./csv";
