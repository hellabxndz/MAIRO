import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { absoluteUrl } from "@/lib/site";
import { LEGAL } from "@/lib/legal";
import { passwordProblem } from "@/lib/auth-rules/password";
import { takeResetRequest } from "@/lib/login-throttle";
import { RESET_INVALID_MESSAGE, RESET_LIMIT_MESSAGE, RESET_SENT_MESSAGE } from "@/lib/password-reset-messages";

// "Forgot your password?": a one-use link, good for an hour, emailed to the
// account's own address. The answer to a request is the same whether or not
// the address has an account, so the form can't be used to find out who is a
// customer. Only a hash of the token is stored.

export const RESET_TTL_MS = 60 * 60 * 1000;
export { RESET_INVALID_MESSAGE, RESET_LIMIT_MESSAGE, RESET_SENT_MESSAGE };

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export type ResetRequestResult = { ok: true } | { ok: false; error: string };

export async function requestPasswordReset(email: string, ip: string | null, now = new Date()): Promise<ResetRequestResult> {
  if (!emailConfigured()) return { ok: false, error: `Email ${LEGAL.contactEmail} from your account's address and we'll reset it for you.` };
  // Counted before the lookup, like sign-in, so an unknown address counts too.
  if (!(await takeResetRequest(email, ip, now.getTime()))) return { ok: false, error: RESET_LIMIT_MESSAGE };

  const typed = email.trim();
  if (!typed) return { ok: true };
  const user =
    (await db.user.findUnique({ where: { email: typed }, select: { id: true, email: true } })) ??
    (await db.user.findFirst({ where: { email: { equals: typed, mode: "insensitive" } }, select: { id: true, email: true } }));
  if (!user) return { ok: true };

  const token = randomBytes(32).toString("base64url");
  const row = await db.passwordReset.create({
    data: { userId: user.id, tokenHash: tokenHash(token), expiresAt: new Date(now.getTime() + RESET_TTL_MS) },
    select: { id: true },
  });
  const link = absoluteUrl(`/reset-password?token=${token}`);
  const sent = await sendEmail({
    to: user.email,
    subject: "Reset your MAIRO password",
    text: [
      "Someone asked to reset the password for your MAIRO account.",
      "",
      `To choose a new password, open this link within the next hour:`,
      link,
      "",
      "If it wasn't you, ignore this email — your password stays as it is.",
      "",
      `Questions? ${LEGAL.contactEmail}`,
    ].join("\n"),
  });
  // Not sent: the link would never arrive, so it shouldn't be usable either.
  if (!sent.sent) {
    await db.passwordReset.delete({ where: { id: row.id } });
    console.error(`[password-reset] not sent: ${sent.reason}`);
  }
  return { ok: true };
}

/** Whether a link can still be used — for showing the form or the "expired" note. */
export async function resetLinkValid(token: string, now = new Date()): Promise<boolean> {
  if (!token) return false;
  const row = await db.passwordReset.findUnique({ where: { tokenHash: tokenHash(token) }, select: { usedAt: true, expiresAt: true } });
  return Boolean(row && !row.usedAt && row.expiresAt > now);
}

export type ResetResult = { ok: true; email: string } | { ok: false; error: string; field?: "password" | "confirm" };

/** Sets the new password and spends the link (and every other outstanding one for the account). */
export async function resetPassword(token: string, password: string, confirm: string, now = new Date()): Promise<ResetResult> {
  const row = token
    ? await db.passwordReset.findUnique({ where: { tokenHash: tokenHash(token) }, select: { id: true, usedAt: true, expiresAt: true, user: { select: { id: true, email: true } } } })
    : null;
  if (!row || row.usedAt || row.expiresAt <= now) return { ok: false, error: RESET_INVALID_MESSAGE };

  const weak = passwordProblem(password, row.user.email);
  if (weak) return { ok: false, error: weak, field: "password" };
  if (password !== confirm) return { ok: false, error: "The two passwords don't match.", field: "confirm" };

  const passwordHash = await bcrypt.hash(password, 10);
  const done = await db.$transaction(async (tx) => {
    // Claimed atomically, so two tabs submitting the same link can't both win.
    const claimed = await tx.passwordReset.updateMany({ where: { id: row.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
    if (claimed.count !== 1) return false;
    await tx.user.update({ where: { id: row.user.id }, data: { passwordHash } });
    await tx.passwordReset.updateMany({ where: { userId: row.user.id, usedAt: null }, data: { usedAt: now } });
    return true;
  });
  return done ? { ok: true, email: row.user.email } : { ok: false, error: RESET_INVALID_MESSAGE };
}

/** Links older than a day are no use to anyone; the daily review cron deletes them. */
export function sweepPasswordResets(now = new Date()) {
  return db.passwordReset.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } });
}
