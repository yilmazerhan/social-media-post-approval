/**
 * Template interpolation — ARCHITECTURE.md §8: "rendering escapes all
 * interpolated values." Templates themselves are trusted (admin-authored,
 * DATABASE.md's `EmailTemplate`); only the variables a caller supplies are
 * untrusted, so only those get escaped, not the surrounding markup.
 */
const TOKEN_PATTERN = /\{\{(\w+)\}\}/g;
const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/** A newline in a variable could inject extra headers into a raw SMTP subject line — strip it rather than escape it, since a subject is never HTML. */
function sanitizeForSubject(value: string): string {
  return value.replace(/[\r\n]+/g, " ");
}

export interface RenderableTemplate {
  subjectTemplate: string;
  bodyTemplate: string;
  isHtml: boolean;
}

export interface RenderedEmail {
  subject: string;
  body: string;
}

/** An unrecognized `{{token}}` is left in place rather than thrown on — an admin-edited template with a typo shouldn't take down the send. */
export function renderTemplate(
  template: RenderableTemplate,
  variables: Record<string, string | number>,
): RenderedEmail {
  const subject = template.subjectTemplate.replace(
    TOKEN_PATTERN,
    (match, key: string) =>
      key in variables ? sanitizeForSubject(String(variables[key])) : match,
  );
  const body = template.bodyTemplate.replace(
    TOKEN_PATTERN,
    (match, key: string) => {
      if (!(key in variables)) return match;
      const raw = String(variables[key]);
      return template.isHtml ? escapeHtml(raw) : raw;
    },
  );
  return { subject, body };
}
