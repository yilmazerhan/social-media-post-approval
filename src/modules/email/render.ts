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

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/**
 * Marks a variable's value as already-safe HTML markup, so `renderTemplate`
 * embeds it verbatim instead of escaping it — the daily digest's `{{items}}`
 * is a pre-built `<ul>` list, not a plain scalar. Whoever constructs one is
 * responsible for escaping any untrusted text (e.g. a post title) folded
 * into it before wrapping it here.
 */
export class RawHtml {
  constructor(readonly value: string) {}
}
export function rawHtml(value: string): RawHtml {
  return new RawHtml(value);
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

export type TemplateVariables = Record<string, string | number | RawHtml>;

/** An unrecognized `{{token}}` is left in place rather than thrown on — an admin-edited template with a typo shouldn't take down the send. */
export function renderTemplate(
  template: RenderableTemplate,
  variables: TemplateVariables,
): RenderedEmail {
  const subject = template.subjectTemplate.replace(
    TOKEN_PATTERN,
    (match, key: string) => {
      if (!(key in variables)) return match;
      const value = variables[key];
      const raw = value instanceof RawHtml ? value.value : String(value);
      return sanitizeForSubject(raw);
    },
  );
  const body = template.bodyTemplate.replace(
    TOKEN_PATTERN,
    (match, key: string) => {
      if (!(key in variables)) return match;
      const value = variables[key];
      if (value instanceof RawHtml) return value.value;
      const raw = String(value);
      return template.isHtml ? escapeHtml(raw) : raw;
    },
  );
  return { subject, body };
}
