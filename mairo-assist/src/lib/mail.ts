import "server-only";
import nodemailer from "nodemailer";
import { log } from "@/lib/log";

/*
 * Transactional email to customers (order verification codes). Two ways to
 * send, whichever is configured:
 *   - Resend (RESEND_API_KEY) — best once you have your own domain;
 *   - any SMTP server (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD), e.g.
 *     Gmail with an app password — works without a domain.
 * MAIL_FROM is the sender. Account emails (sign-up, password reset) are sent
 * by Supabase Auth, which has its own SMTP settings.
 */

type Provider = "resend" | "smtp" | null;

function provider(): Provider {
  if (!process.env.MAIL_FROM) return null;
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SMTP_HOST) return "smtp";
  return null;
}

export function isMailConfigured() {
  return provider() !== null;
}

function resendBase() {
  const test = process.env.RESEND_TEST_API_BASE_URL;
  if (test && process.env.VERCEL_ENV !== "production") return test.replace(/\/+$/, "");
  return "https://api.resend.com";
}

let transport: nodemailer.Transporter | null = null;
function smtp() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT ?? 465);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      // Port 465 is TLS from the start; other ports upgrade with STARTTLS.
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? "" } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  return transport;
}

export async function sendEmail(msg: { to: string; subject: string; text: string; html: string; replyTo?: string | null }) {
  const via = provider();
  if (!via) throw new Error("Email is not configured");
  if (via === "smtp") {
    try {
      await smtp().sendMail({ from: process.env.MAIL_FROM, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html, replyTo: msg.replyTo ?? undefined });
    } catch (e) {
      log.warn("mail.smtp_failed", { error: e instanceof Error ? e.message : String(e) });
      throw new Error("Email could not be sent");
    }
    return;
  }
  const res = await fetch(`${resendBase()}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: [msg.to],
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    log.warn("mail.send_failed", { status: res.status });
    throw new Error(`Email provider returned ${res.status}`);
  }
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
