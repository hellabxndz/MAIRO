/**
 * The sentence somebody is agreeing to when they turn texts on.
 *
 * Its own module, away from the server actions, for two reasons. The form has
 * to render the exact words being agreed to, and a `"use server"` file may
 * only export async functions — exporting a string from one silently strips
 * every export in it, which is how this started as a build failure rather than
 * a type error.
 *
 * Stored verbatim alongside each consent record, never referenced by version
 * number. If this wording changes, what somebody already agreed to must not
 * change with it — that is the whole point of keeping a copy.
 */
export const SMS_CONSENT_TEXT =
  "I agree that MAIRO may text this number with updates about my advertising. Message and data rates may apply. Reply STOP at any time to stop.";
