// What the reset pages say — here, apart from lib/password-reset.ts, so the
// client forms can show them without importing the database.

export const RESET_SENT_MESSAGE =
  "If that address has a MAIRO account, we've emailed it a link to choose a new password. It works for an hour. Check your spam folder if it hasn't arrived in a few minutes.";
export const RESET_LIMIT_MESSAGE = "Too many reset requests. Wait an hour, then try again.";
export const RESET_INVALID_MESSAGE = "This reset link has expired or has already been used. Ask for a new one.";
