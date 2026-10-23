import nodemailer from "nodemailer";
import { env } from "./config.js";

/**
 * Outgoing email behind one small interface, so routes never care how mail leaves.
 *
 * - SMTP transport when SMTP_HOST is set (any provider: a mailbox, SES, Postmark, ...).
 * - Console transport otherwise: the message is written to the API log. Development
 *   only — on a public deployment it means reset links only reach the server log.
 *
 * Tests swap the transport with setMailTransport() and read what was sent.
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface MailTransport {
  readonly name: string;
  send(message: MailMessage): Promise<void>;
}

export const consoleTransport: MailTransport = {
  name: "console",
  async send(message) {
    console.log(
      ["--- email (console transport; set SMTP_HOST to send for real) ---", `To: ${message.to}`, `Subject: ${message.subject}`, "", message.text, "---"].join(
        "\n",
      ),
    );
  },
};

export function smtpTransport(): MailTransport {
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? "" } : undefined,
  });
  return {
    name: "smtp",
    async send(message) {
      await transporter.sendMail({ from: env.MAIL_FROM, to: message.to, subject: message.subject, text: message.text });
    },
  };
}

let transport: MailTransport = env.SMTP_HOST ? smtpTransport() : consoleTransport;

export const mailTransportName = (): string => transport.name;

export function setMailTransport(next: MailTransport): MailTransport {
  const previous = transport;
  transport = next;
  return previous;
}

/**
 * Sends without making the caller wait or fail. Used by the forgot-password and
 * verification routes, whose responses must look the same (and take about the same
 * time) whether or not the email exists.
 */
export function sendMailInBackground(message: MailMessage): Promise<void> {
  return transport.send(message).catch((error: unknown) => {
    console.error(`Sending email "${message.subject}" failed`, error);
  });
}

/** Origin of the web app, for links in emails. */
export const appUrl = (): string => (env.APP_URL ?? env.CORS_ORIGIN.split(",")[0]!.trim()).replace(/\/+$/, "");
