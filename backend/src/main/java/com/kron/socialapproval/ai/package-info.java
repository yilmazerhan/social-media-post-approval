/**
 * AI context: advisory content review. Providers sit behind a port and can never cause a state transition.
 *
 * <p>Module boundary rule: everything under {@code internal} is private to this module. Other
 * modules may depend only on the {@code api} package, or react to published domain events.
 * See ARCHITECTURE.md sections 1.4 and 3.1.
 */
package com.kron.socialapproval.ai;
