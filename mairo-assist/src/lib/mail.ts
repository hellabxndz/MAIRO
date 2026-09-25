import "server-only";
import { log } from "@/lib/log";

/*
 * Transactional email to customers (order verification codes) through
 * Resend's HTTP API. Needs RESEND_API_KEY and MAIL_FROM (an address on a
 * domain verified in Resend). Account emails (sign-up, password reset) are
 * sent by Supabase Auth, not here.
 */

export function isMailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

function apiBase() {
  const test = process.env.RESEND_TEST_API_BASE_URL;
  if (test && process.env.VERCEL_ENV !== "production") return test.replace(/\/+$/, "");
  return "https://api.resend.com";
}

export async function sendEmail(msg: { to: string; subject: string; text: string; html: string; replyTo?: string | null }) {
  if (!isMailConfigured()) throw new Error("Email is not configured");
  const res = await fetch(`${apiBase()}/emails`, {
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
