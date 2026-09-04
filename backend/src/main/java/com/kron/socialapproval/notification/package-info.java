/**
 * Notification context: the in-app notification centre, per-user preferences and the transactional email outbox.
 *
 * <p>Module boundary rule: everything under {@code internal} is private to this module. Other
 * modules may depend only on the {@code api} package, or react to published domain events.
 * See ARCHITECTURE.md sections 1.4 and 3.1.
 */
package com.kron.socialapproval.notification;
