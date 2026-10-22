import { createHash } from "node:crypto";
import { cache } from "react";
import { db } from "@/lib/db";

// Signing every other device out when a password changes.
//
// Sessions are JWTs, so there is no session table to clear. Instead each
// token carries a stamp derived from the account's password hash at the
// moment it was issued, and every server-side read of the session compares it
// with the account's current hash. A password reset changes the hash, so
// every token issued before it stops matching and that device is signed out
// — including whoever had the old password. No migration, nothing extra
// stored, and the stamp reveals nothing about the password (a truncated hash
// of a bcrypt hash).
//
// A token from before stamps existed has none, and is treated as stale: one
// sign-in for everybody once, rather than leaving those sessions impossible to
// revoke for the rest of their 30 days.

export function passwordStamp(passwordHash: string | null | undefined): string {
  return createHash("sha256").update(`mairo-session:${passwordHash ?? "no-password"}`).digest("base64url").slice(0, 22);
}

/** The account's current stamp, read once per request; null if the account is gone. */
export const currentStamp = cache(async (userId: string): Promise<string | null> => {
  const user = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  return user ? passwordStamp(user.passwordHash) : null;
});

/**
 * Whether a token may still be used. A database that can't be reached lets
 * the token through (logged): the pages behind it need the database anyway,
 * and signing everybody out during a blip would be worse than a stale session
 * surviving it.
 */
export async function sessionStillValid(token: { sub?: string | null; pw?: unknown }): Promise<boolean> {
  if (!token.sub) return true;
  let current: string | null;
  try {
    current = await currentStamp(token.sub);
  } catch (error) {
    console.error("Couldn't check the session's password stamp:", error instanceof Error ? error.message : error);
    return true;
  }
  const valid = current !== null && token.pw === current;
  if (!valid) {
    // Why a session was ended, for the deployment's logs. No token or hash.
    console.warn(
      `[session] signed out user ${token.sub}: ${current === null ? "no such user" : token.pw === undefined ? "session from before password stamps" : "password changed since sign-in"}`
    );
  }
  return valid;
}
