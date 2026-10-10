// What a new password must be, and how an email address is stored.
//
// Pure, so the sign-up forms can show the same rule as you type that the
// server enforces when you submit. Length is the rule that matters; a short
// list of the passwords tried first by anyone guessing is refused as well.
// No "must contain a symbol" rules — they make passwords harder to remember,
// not harder to guess.

export const PASSWORD_MIN = 8;
/** bcrypt only reads the first 72 bytes; anything far past that is a paste gone wrong. */
export const PASSWORD_MAX = 128;

const COMMON = new Set([
  "password", "password1", "password12", "password123", "passw0rd", "12345678", "123456789", "1234567890",
  "87654321", "11111111", "00000000", "qwerty12", "qwerty123", "qwertyui", "qwertyuiop", "1q2w3e4r",
  "iloveyou", "abc12345", "abcd1234", "letmein1", "welcome1", "welcome123", "admin123", "sunshine",
  "football", "baseball", "princess", "mairo123", "changeme",
]);

/** Why this password won't do, in words for the form — or null when it's fine. */
export function passwordProblem(password: string, email?: string | null): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Use ${PASSWORD_MAX} characters or fewer.`;
  if (/^(.)\1+$/.test(password)) return "Use more than one repeated character.";
  if (COMMON.has(password.toLowerCase())) return "That password is one of the first anyone would guess. Pick another.";
  if (email && password.trim().toLowerCase() === email.trim().toLowerCase()) return "Don't use your email address as your password.";
  return null;
}

/**
 * An email address as it is stored: trimmed and lower-case.
 *
 * A phone keyboard adds a trailing space after a suggested address, and people
 * capitalise their name in one place and not another. Neither should create a
 * second account or lock someone out of the first.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
