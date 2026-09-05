package com.kron.socialapproval.content;

import static org.assertj.core.api.Assertions.assertThat;

import com.kron.socialapproval.content.internal.application.HtmlSanitizer;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** The allow-list is the control, not the editor's toolbar. */
class HtmlSanitizerTest {

    private final HtmlSanitizer sanitizer = new HtmlSanitizer();

    @Test
    @DisplayName("script tags do not survive")
    void stripsScripts() {
        String sanitized = sanitizer.sanitize("<p>Hello</p><script>alert('x')</script>");

        assertThat(sanitized).contains("Hello").doesNotContain("script").doesNotContain("alert");
    }

    @Test
    @DisplayName("event handlers and inline styles are removed")
    void stripsAttributes() {
        String sanitized = sanitizer.sanitize("<p onclick=\"steal()\" style=\"color:red\">Text</p>");

        assertThat(sanitized).doesNotContain("onclick").doesNotContain("style");
    }

    @Test
    @DisplayName("javascript: links are removed")
    void stripsDangerousProtocols() {
        String sanitized = sanitizer.sanitize("<a href=\"javascript:alert(1)\">click</a>");

        assertThat(sanitized).doesNotContain("javascript:");
    }

    @Test
    @DisplayName("the formatting the editor offers is kept")
    void keepsAllowedFormatting() {
        String sanitized = sanitizer.sanitize(
                "<p><strong>Bold</strong> and <em>italic</em></p><ul><li>One</li></ul>"
                        + "<a href=\"https://kron.com.tr\">link</a>");

        assertThat(sanitized).contains("<strong>").contains("<em>").contains("<li>").contains("https://kron.com.tr");
    }

    @Test
    @DisplayName("the plain-text projection is what search and character counts use")
    void producesPlainText() {
        String text = sanitizer.toPlainText("<p>First line</p><p>Second <strong>line</strong></p>");

        assertThat(text).isEqualTo("First line\nSecond line");
    }
}
