/**
 * Reporting context: read-model queries, dashboards and exports.
 *
 * <p>Module boundary rule: everything under {@code internal} is private to this module. Other
 * modules may depend only on the {@code api} package, or react to published domain events.
 * See ARCHITECTURE.md sections 1.4 and 3.1.
 */
package com.kron.socialapproval.reporting;
