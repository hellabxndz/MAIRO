// Account email — today only the "forgot your password?" link.
//
// Sent through Resend's HTTP API when RESEND_API_KEY and EMAIL_FROM are both
// set; otherwise nothing is sent and the caller is told why, so the forgot-
// password page can say "email support" instead of promising a link that
// will never arrive. The address and the message are never logged.

export type EmailResult = { sent: true; provider: string } | { sent: false; reason: string };

/** Whether this deployment can send email at all. */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim());
}

/** Swapped in by checks, so no test ever reaches Resend. */
type Transport = (body: Record<string, unknown>) => Promise<{ ok: boolean; status: number }>;
let transport: Transport | null = null;
export function withEmailTransport<T>(t: Transport, fn: () => Promise<T>): Promise<T> {
  const before = transport;
  transport = t;
  return fn().finally(() => {
    transport = before;
  });
}

export async function sendEmail(message: { to: string; subject: string; text: string }): Promise<EmailResult> {
  if (!emailConfigured()) return { sent: false, reason: "No email provider is configured (RESEND_API_KEY and EMAIL_FROM)." };
  const body = { from: process.env.EMAIL_FROM!.trim(), to: [message.to], subject: message.subject, text: message.text };
  try {
    const res = transport
      ? await transport(body)
      : await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10_000),
        });
    if (!res.ok) {
      console.error(`[email] Resend refused the message (HTTP ${res.status})`);
      return { sent: false, reason: `The email provider refused it (HTTP ${res.status}).` };
    }
    return { sent: true, provider: "resend" };
  } catch (error) {
    console.error(`[email] Resend unreachable: ${error instanceof Error ? error.name : "error"}`);
    return { sent: false, reason: "The email provider couldn't be reached." };
  }
}
