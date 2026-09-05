package com.kron.socialapproval.content.internal.application;

import org.owasp.html.HtmlPolicyBuilder;
import org.owasp.html.PolicyFactory;
import org.springframework.stereotype.Component;

/**
 * Server-side sanitisation of the rich-text body.
 *
 * <p>The allow-list is deliberately narrow — the editor offers bold, italic, underline, lists and
 * links, and nothing else survives this filter. Sanitising in the browser is cosmetic: this is the
 * control (ARCHITECTURE.md section 13.3).
 */
@Component
public class HtmlSanitizer {

    private static final PolicyFactory POLICY = new HtmlPolicyBuilder()
            .allowElements("p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "a")
            .allowUrlProtocols("https", "mailto")
            .allowAttributes("href").onElements("a")
            .requireRelNofollowOnLinks()
            .toFactory();

    public String sanitize(String html) {
        return html == null ? "" : POLICY.sanitize(html);
    }

    /**
     * Plain-text projection used for search, character counting and AI review, so that neither has
     * to parse markup.
     */
    public String toPlainText(String html) {
        if (html == null || html.isBlank()) {
            return "";
        }
        String withBreaks = html
                .replaceAll("(?i)<br\\s*/?>", "\n")
                .replaceAll("(?i)</p>", "\n")
                .replaceAll("(?i)</li>", "\n");
        String stripped = withBreaks.replaceAll("<[^>]+>", "");
        return unescape(stripped)
                .replaceAll("[ \\t]+", " ")
                .replaceAll("\n{3,}", "\n\n")
                .trim();
    }

    /** The sanitiser only ever emits this handful of entities, so a full HTML decoder is overkill. */
    private static String unescape(String text) {
        return text
                .replace("&nbsp;", " ")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&quot;", "\"")
                .replace("&#39;", "'")
                .replace("&#34;", "\"")
                .replace("&amp;", "&");
    }
}
