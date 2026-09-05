package com.kron.socialapproval.workflow.internal.domain;

/**
 * How many of the assigned approvers have to agree.
 *
 * <p>In every mode a single rejection or change request ends the round immediately: there is no
 * value in collecting further opinions on content that is going back to its author.
 */
public enum ApprovalMode {
    ANY_ONE,
    ALL,
    SEQUENTIAL
}
