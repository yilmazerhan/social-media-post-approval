/**
 * `SMTPEmailProvider` — ARCHITECTURE.md §8: "performs delivery in the
 * worker, never in the request path." Nodemailer transport built once
 * from CONFIGURATION.md's SMTP_* vars and reused across sends.
 */
import nodemailer, { type Transporter } from "nodemailer";
import { config } from "@/server/config";

export interface EmailMessage {
  to: string;
  cc?: string;
  subject: string;
  html?: string;
  text?: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

let transport: Transporter | null = null;

function getTransport(): Transporter {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_TLS === "tls",
      requireTLS: config.SMTP_TLS === "starttls",
      ignoreTLS: config.SMTP_TLS === "none",
      tls: { rejectUnauthorized: config.SMTP_TLS_REJECT_UNAUTHORIZED },
      connectionTimeout: config.SMTP_TIMEOUT_MS,
      socketTimeout: config.SMTP_TIMEOUT_MS,
      auth: config.SMTP_USERNAME
        ? { user: config.SMTP_USERNAME, pass: config.SMTP_PASSWORD }
        : undefined,
    });
  }
  return transport;
}

export const smtpEmailProvider: EmailProvider = {
  async send(message) {
    await getTransport().sendMail({
      from: config.SMTP_FROM,
      replyTo: config.SMTP_REPLY_TO,
      to: message.to,
      cc: message.cc,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  },
};
