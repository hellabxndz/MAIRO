import { createHash } from "node:crypto";
import { db } from "@/lib/db";

// How many times a password may be tried, so a password can't be guessed by
// trying thousands. Counted per account and per visitor (a salted hash of the
// IP address — never the address itself, never the email in clear) over a
// 15-minute window, in the same ToolUsage table the free tools' limits use.
//
// Checked in the credentials provider itself (lib/auth.ts), so it holds
// whether the sign-in comes through the form's server action or straight to
// /api/auth/callback/credentials. Every attempt counts, right or wrong: ten
// sign-ins in fifteen minutes is far beyond anyone typing their own password.
// MAIRO staff accounts (AIOS, which sees every customer) get the same limit.

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_ATTEMPTS_PER_ACCOUNT = 10;
export const LOGIN_ATTEMPTS_PER_VISITOR = 30;
export const LOGIN_LIMIT_MESSAGE = "Too many sign-in attempts. Wait 15 minutes, then try again.";

const salt = () => process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "mairo";
const hash = (value: string) => createHash("sha256").update(`${salt()}|${value}`).digest("hex").slice(0, 32);

async function take(bucket: string, limit: number, windowStart: Date): Promise<boolean> {
  const row = await db.toolUsage.upsert({
    where: { bucket },
    create: { bucket, count: 1, windowStart },
    update: { count: { increment: 1 } },
    select: { count: true },
  });
  return row.count <= limit;
}

/** Counts one sign-in attempt; false when the account or the visitor is over the limit. */
export async function takeLoginAttempt(email: string, ip: string | null, now = Date.now()): Promise<boolean> {
  const window = Math.floor(now / LOGIN_WINDOW_MS);
  const windowStart = new Date(window * LOGIN_WINDOW_MS);
  const account = await take(`login:acct:${hash(email.trim().toLowerCase())}:${window}`, LOGIN_ATTEMPTS_PER_ACCOUNT, windowStart);
  const visitor = await take(`login:ip:${hash(ip ?? "?")}:${window}`, LOGIN_ATTEMPTS_PER_VISITOR, windowStart);
  return account && visitor;
}

export const RESET_WINDOW_MS = 60 * 60 * 1000;
export const RESET_REQUESTS_PER_ACCOUNT = 3;
export const RESET_REQUESTS_PER_VISITOR = 10;

/** Counts one "forgot your password?" request: a few an hour, so it can't be used to flood someone's inbox. */
export async function takeResetRequest(email: string, ip: string | null, now = Date.now()): Promise<boolean> {
  const window = Math.floor(now / RESET_WINDOW_MS);
  const windowStart = new Date(window * RESET_WINDOW_MS);
  const account = await take(`reset:acct:${hash(email.trim().toLowerCase())}:${window}`, RESET_REQUESTS_PER_ACCOUNT, windowStart);
  const visitor = await take(`reset:ip:${hash(ip ?? "?")}:${window}`, RESET_REQUESTS_PER_VISITOR, windowStart);
  return account && visitor;
}

/** The client's address as the hosting saw it (Vercel sets x-forwarded-for). */
export function requestIp(request: Request | undefined): string | null {
  return request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request?.headers.get("x-real-ip") || null;
}
