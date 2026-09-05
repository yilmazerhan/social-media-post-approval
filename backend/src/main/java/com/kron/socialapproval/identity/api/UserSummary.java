package com.kron.socialapproval.identity.api;

import java.util.UUID;

/**
 * How a person appears anywhere else in the product: a name and enough context to know who they
 * are, never an internal identifier on screen.
 */
public record UserSummary(
        UUID id,
        String displayName,
        String email,
        String department,
        String jobTitle,
        String initials) {

    public static String initialsOf(String firstName, String lastName) {
        String first = firstName == null || firstName.isBlank() ? "" : firstName.substring(0, 1);
        String last = lastName == null || lastName.isBlank() ? "" : lastName.substring(0, 1);
        return (first + last).toUpperCase();
    }
}
