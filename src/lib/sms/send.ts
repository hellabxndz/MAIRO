import { db } from "@/lib/db";

// Text messages, and every reason not to send one.
//
// This is the only part of MAIRO that reaches a person somewhere other than
// the product. That makes it the part where being wrong is expensive: a text
// to a number somebody mistyped goes to a stranger, a text after they asked to
// stop is a complaint, and a text at 3am about a 2% budget shift is how a
// business decides the whole product is noisy.
//
// So the send path is a list of refusals with a provider call at the end of it.
// Nothing is sent unless there is a number, it has been verified by code, the
// person consented in words we stored, they have not opted out, this
// particular kind of update is switched on, and a provider is actually
// configured. Every one of those returns a reason rather than throwing, so the
// caller can log why a notification did not go out instead of discovering an
// empty catch block later.
//
// No provider is wired up yet. When one is, it goes in `deliver()` and nothing
// above it changes.

export type SmsKind = "campaign-live" | "needs-attention" | "weekly-summary" | "budget-change";

export type SmsResult =
  | { sent: true; provider: string }
  | { sent: false; reason: string };

/** Which preference switch governs which kind of message. */
const SWITCH: Record<SmsKind, "onCampaignLive" | "onNeedsAttention" | "onWeeklySummary" | "onBudgetChange"> = {
  "campaign-live": "onCampaignLive",
  "needs-attention": "onNeedsAttention",
  "weekly-summary": "onWeeklySummary",
  "budget-change": "onBudgetChange",
};

/** Whether this deployment can send at all. */
export function smsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_FROM_NUMBER?.trim(),
  );
}

/**
 * Digits only, plus a leading +.
 *
 * Deliberately not a full phone-number parser. It normalises what somebody
 * typed so the same number is not stored three ways, and it rejects the
 * obviously impossible; the verification code is what actually proves the
 * number is theirs, and no amount of regex does that job.
 *
 * Ten digits with no + is read as North American. That is a guess, and it is
 * the one guess in here — somebody outside North America typing their number
 * without a country code gets a +1 number that is not theirs. What makes that
 * survivable rather than dangerous is the order of the flow: nothing is ever
 * sent to a number until a code sent to it comes back, so a wrong guess costs
 * one undelivered verification text and an error message, not a stream of
 * somebody else's campaign updates. The field asks for the country code and
 * the placeholder shows one.
 */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  // A US number typed the way Americans type it, with no country code.
  if (!trimmed.startsWith("+") && digits.length === 10) return `+1${digits}`;
  if (!trimmed.startsWith("+") && digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  if (!trimmed.startsWith("+")) return null;
  return `+${digits}`;
}

/** The last four, for showing a number back without printing it in full. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length < 4) return "•••";
  return `••• ••• ${digits.slice(-4)}`;
}

/**
 * Send one update to a business, if every condition for sending it holds.
 *
 * Returns rather than throws. A notification failing is not a reason for the
 * thing that triggered it — a campaign going live, a budget shift — to fail
 * with it.
 */
export async function sendSms(
  organizationId: string,
  kind: SmsKind,
  body: string,
): Promise<SmsResult> {
  const pref = await db.smsPreference.findUnique({ where: { organizationId } });

  if (!pref) return { sent: false, reason: "no number on file" };
  if (!pref.verifiedAt) return { sent: false, reason: "number not verified" };
  if (!pref.consentAt) return { sent: false, reason: "no consent recorded" };
  if (pref.optedOutAt) return { sent: false, reason: "opted out" };
  if (!pref[SWITCH[kind]]) return { sent: false, reason: `${kind} updates switched off` };

  const result = await deliver(pref.phone, `${body}\n\nReply STOP to stop these texts.`);
  if (result.sent) {
    await db.smsPreference.update({
      where: { organizationId },
      data: { lastSentAt: new Date() },
    });
  }
  return result;
}

/**
 * The verification text.
 *
 * Deliberately not routed through sendSms — that function refuses to send to
 * an unverified number, which is every number at this point. It still needs a
 * configured provider and a consent record, because a verification code is
 * itself a text message somebody has to have asked for.
 */
export async function sendVerificationCode(phone: string, code: string): Promise<SmsResult> {
  return deliver(
    phone,
    `${code} is your MAIRO verification code. It expires in 10 minutes. Reply STOP to stop these texts.`,
  );
}

/** A six-digit code. Long enough not to be guessed in ten minutes of tries. */
export function verificationCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * The provider call.
 *
 * Twilio's REST API rather than their SDK — it is one form post, and a
 * dependency that exists to build one form post is a dependency that has to be
 * kept up to date for no reason.
 *
 * When nothing is configured this says so instead of pretending to succeed.
 * A notification system that silently does nothing is worse than one that is
 * switched off, because the operator believes their customers are being told.
 */
async function deliver(to: string, body: string): Promise<SmsResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();

  if (!sid || !token || !from) {
    return {
      sent: false,
      reason:
        "no SMS provider configured — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER",
    };
  }

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }),
      },
    );

    if (!response.ok) {
      const detail = await response.text();
      console.error("SMS send failed:", response.status, detail);
      return { sent: false, reason: `provider rejected the message (${response.status})` };
    }
    return { sent: true, provider: "twilio" };
  } catch (error) {
    console.error("SMS send failed:", error);
    return { sent: false, reason: "could not reach the SMS provider" };
  }
}
