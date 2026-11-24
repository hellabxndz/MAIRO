import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Whether an Authorization header carries exactly `Bearer <secret>`, compared
 * in constant time — a plain `===` returns sooner the earlier two strings
 * differ, which leaks the secret a character at a time to anyone who can time
 * enough requests. Both sides are hashed first so their lengths match.
 * No secret configured means no access.
 */
export function bearerMatches(header: string | null, secret: string | undefined): boolean {
  const s = secret?.trim();
  if (!s || !header) return false;
  const a = createHash("sha256").update(header).digest();
  const b = createHash("sha256").update(`Bearer ${s}`).digest();
  return timingSafeEqual(a, b);
}
