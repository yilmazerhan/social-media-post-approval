import { describe, expect, it } from "vitest";
import { renderTemplate } from "@/modules/email/render";

/**
 * Phase 17 — ARCHITECTURE.md §8: "rendering escapes all interpolated
 * values." The template markup itself is trusted (admin-authored); only
 * the caller-supplied variables are untrusted.
 */
describe("renderTemplate", () => {
  const htmlTemplate = {
    subjectTemplate: "Hello {{name}}",
    bodyTemplate: "<p>Hi {{name}}, your post {{title}} is ready.</p>",
    isHtml: true,
  };

  it("escapes HTML-significant characters in an interpolated body value", () => {
    const result = renderTemplate(htmlTemplate, {
      name: "Jane",
      title: '<script>alert("x")</script>',
    });
    expect(result.body).toBe(
      "<p>Hi Jane, your post &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; is ready.</p>",
    );
  });

  it("does not escape the surrounding template markup", () => {
    const result = renderTemplate(htmlTemplate, { name: "Jane", title: "X" });
    expect(result.body).toContain("<p>");
    expect(result.body).not.toContain("&lt;p&gt;");
  });

  it("leaves an unrecognized token in place rather than throwing", () => {
    const result = renderTemplate(htmlTemplate, { name: "Jane" });
    expect(result.body).toContain("{{title}}");
  });

  it("does not HTML-escape a plain-text template's body", () => {
    const plainTemplate = {
      subjectTemplate: "Hi {{name}}",
      bodyTemplate: "Hi {{name}}, see {{title}}.",
      isHtml: false,
    };
    const result = renderTemplate(plainTemplate, {
      name: "Jane",
      title: "<b>bold</b>",
    });
    expect(result.body).toBe("Hi Jane, see <b>bold</b>.");
  });

  it("strips newlines from a subject value to prevent header injection", () => {
    const result = renderTemplate(htmlTemplate, {
      name: "Jane\r\nBcc: attacker@evil.example",
      title: "X",
    });
    expect(result.subject).toBe("Hello Jane Bcc: attacker@evil.example");
    expect(result.subject).not.toContain("\n");
  });
});
