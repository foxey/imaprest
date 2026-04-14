import nodemailer from "nodemailer";
import { SmtpConfig } from "./credentials";

export interface MailOptions {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  text?: string | null;
  html?: string | null;
  inReplyTo?: string | null;
  references?: string[];
}

export async function sendMail(
  auth: { user: string; password: string },
  smtp: SmtpConfig,
  mail: MailOptions
): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.tls,
    auth: { user: auth.user, pass: auth.password },
    connectionTimeout: 10_000,
    socketTimeout: 30_000,
  });

  await transporter.sendMail({
    from: mail.from,
    to: mail.to.join(", "),
    ...(mail.cc && mail.cc.length > 0 ? { cc: mail.cc.join(", ") } : {}),
    subject: mail.subject,
    ...(mail.text ? { text: mail.text } : {}),
    ...(mail.html ? { html: mail.html } : {}),
    ...(mail.inReplyTo ? { inReplyTo: mail.inReplyTo } : {}),
    ...(mail.references && mail.references.length > 0
      ? { references: mail.references.join(" ") }
      : {}),
  });
}
