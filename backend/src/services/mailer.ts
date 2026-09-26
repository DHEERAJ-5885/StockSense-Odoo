import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

/**
 * Sends email with Nodemailer.
 *
 * Configure SMTP in backend/.env (see .env.example). With no SMTP_HOST the mailer runs in
 * "console" mode: nothing is sent and the message (including any code) is printed to the
 * server log, which is handy for local development.
 */
let transport: Transporter | null = null;

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST);
}

export function mailerMode(): "smtp" | "console" {
  return smtpConfigured() ? "smtp" : "console";
}

function getTransport(): Transporter {
  if (transport) return transport;

  if (smtpConfigured()) {
    const port = Number(process.env.SMTP_PORT || 587);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      // 465 = implicit TLS; 587 = STARTTLS
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  } else {
    transport = nodemailer.createTransport({ jsonTransport: true });
  }
  return transport;
}

function fromAddress() {
  return process.env.MAIL_FROM || process.env.SMTP_USER || "StockSense <no-reply@stocksense.local>";
}

export async function sendMail(opts: { to: string; subject: string; text: string; html: string }) {
  await getTransport().sendMail({ from: fromAddress(), ...opts });

  if (mailerMode() === "console") {
    console.log(
      `\n[mail:console] SMTP is not configured, so this email was NOT sent.\n` +
        `  To: ${opts.to}\n  Subject: ${opts.subject}\n  ${opts.text.replace(/\n/g, "\n  ")}\n`
    );
  }
}

const shell = (body: string) =>
  `<div style="font-family:Georgia,serif;max-width:480px;margin:auto;padding:24px;color:#1c1c1c">` +
  `<div style="font-size:24px;margin-bottom:16px">Stock<em style="color:#8a6a3a">Sense</em></div>${body}` +
  `<p style="color:#777;font-size:12px;margin-top:24px">If this wasn’t you, you can ignore this email.</p></div>`;

export function sendResetCodeEmail(to: string, code: string) {
  return sendMail({
    to,
    subject: "Your StockSense password reset code",
    text: `Your StockSense code is ${code}\nIt expires in 10 minutes.\nIf you didn't ask for it, ignore this email.`,
    html: shell(
      `<p>Use this code to reset your password:</p>` +
        `<p style="font-size:32px;letter-spacing:8px;font-weight:bold;margin:8px 0">${code}</p>` +
        `<p>It expires in 10 minutes.</p>`
    ),
  });
}

export function sendPasswordChangedEmail(to: string) {
  return sendMail({
    to,
    subject: "Your StockSense password was changed",
    text: "Your StockSense password was just changed. If this wasn't you, reset it again right away.",
    html: shell(`<p>Your StockSense password was just changed.</p><p>If this wasn’t you, reset it again right away.</p>`),
  });
}
