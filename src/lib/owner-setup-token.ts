import { timingSafeEqual } from "node:crypto";

// Deliberately NOT in a "use server" file. Every exported async function in one
// of those becomes a callable server action — a remote endpoint. Exporting this
// check from there would publish an oracle that answers "is this the right
// token?" for any string, which is exactly what the constant-time compare below
// exists to prevent. Keeping it in a plain module means it is only ever reached
// through code that already decided to call it.

/**
 * Gate for the owner recovery path on /setup.
 *
 * Recovery is enabled by setting OWNER_SETUP_TOKEN in the environment. Only
 * someone who can set environment variables on the deployment (the operator)
 * can produce a matching value, which is what makes the page safe to leave
 * routable. When the variable is unset, recovery does not exist at all.
 *
 * Remove the variable once recovery is done — leaving it set leaves a
 * permanent password-reset door open.
 */
export function ownerSetupTokenIsValid(supplied: string | undefined): boolean {
  const expected = process.env.OWNER_SETUP_TOKEN?.trim();
  if (!expected || !supplied) return false;

  // Constant-time compare so the token can't be recovered a character at a time
  // by timing repeated requests. Lengths are checked first because
  // timingSafeEqual throws when the buffers differ in length — that length
  // check is itself not constant-time, but a token's length is not the secret.
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(supplied.trim(), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
