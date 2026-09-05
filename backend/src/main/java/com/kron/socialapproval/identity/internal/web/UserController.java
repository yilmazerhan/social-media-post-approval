package com.kron.socialapproval.identity.internal.web;

import com.kron.socialapproval.access.api.Permissions;
import com.kron.socialapproval.identity.api.UserDirectory;
import com.kron.socialapproval.identity.api.UserSummary;
import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/users")
public class UserController {

    private final UserDirectory userDirectory;

    public UserController(UserDirectory userDirectory) {
        this.userDirectory = userDirectory;
    }

    /**
     * The approver picker in the editor. Needs only the ability to submit — an author has to be
     * able to see who could review their work.
     */
    @GetMapping("/approvers")
    @PreAuthorize("hasAuthority('" + Permissions.POST_SUBMIT + "')")
    public List<UserSummary> approvers() {
        return userDirectory.approvers();
    }
}
