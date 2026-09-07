/**
 * `EmailService`, `SMTPEmailProvider`, and template rendering —
 * ARCHITECTURE.md §8, DATABASE.md §6.
 *
 * Public surface of this module. Other modules and route handlers import
 * from here — never from a file inside this directory directly. See
 * ARCHITECTURE.md §2 (module rules) for the boundary contract.
 */
export { sendTemplatedEmail, sendTestEmail } from "./service";
export type { SendTemplatedEmailInput, EmailSendJobPayload } from "./types";
export { sendTestEmailSchema, type SendTestEmailInput } from "./validation";
export {
  escapeHtml,
  rawHtml,
  RawHtml,
  renderTemplate,
  type TemplateVariables,
  type RenderableTemplate,
  type RenderedEmail,
} from "./render";
