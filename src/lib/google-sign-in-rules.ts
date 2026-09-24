// "Continue with Google": the decisions, kept pure so the rules that decide
// whose account a Google login opens can be checked without a database or a
// Google round trip (npm run check:google).
//
// The rules, in order:
//
// 1. A Google account MAIRO has seen before (matched on Google's stable `sub`)
//    signs straight into the account it opened last time.
// 2. Otherwise Google has to say the address is verified. An unverified
//    address proves nothing about who owns it, so it can neither open an
//    existing account nor claim a new one — claiming it would lock the real
//    owner out of signing up with it later.
// 3. An existing account with that address is linked, once, and from then on
//    rule 1 applies. There is never a second user for one address: if the
//    account is already linked to a different Google account, the login is
//    refused rather than duplicated or re-pointed.
// 4. Only a sign-up creates anything, and it creates exactly what the email
//    sign-up does: an Organization plus a CLIENT, or a WORKSPACE plus a
//    FREELANCER. A Google login from /sign-in with no account behind it is
//    sent to /sign-up, because the business name is asked for there and is
//    not editable afterwards — guessing one from a Google profile would leave
//    a placeholder on the account for good.

export type GoogleIntentMode = "signin" | "client" | "freelancer";

/** What the button the person pressed was for, carried across the Google round trip. */
export type GoogleIntent = {
  mode: GoogleIntentMode;
  /** The business (client) or studio (freelancer) name typed before pressing it. */
  orgName?: string;
};

export type GoogleProfileFacts = {
  sub: string | null | undefined;
  email: string | null | undefined;
  /** Google's `email_verified`. Anything but `true` counts as unverified. */
  emailVerified: unknown;
  name: string | null | undefined;
};

export type ExistingUser = { id: string; googleId: string | null };

export type GoogleErrorCode =
  | "GoogleProfileIncomplete"
  | "GoogleEmailUnverified"
  | "GoogleAccountMismatch"
  | "GoogleAccountConflict"
  | "GoogleNoAccount"
  | "GoogleNeedsName";

export type GoogleEntryPage = "/sign-in" | "/sign-up" | "/for-freelancers";

export type GoogleDecision =
  | { kind: "sign-in"; userId: string }
  | { kind: "link"; userId: string; googleId: string }
  | {
      kind: "create";
      role: "CLIENT" | "FREELANCER";
      orgKind: "BUSINESS" | "WORKSPACE";
      orgName: string;
      email: string;
      name: string | null;
      googleId: string;
    }
  | { kind: "refuse"; error: GoogleErrorCode; page: GoogleEntryPage };

/** Same limit the email forms effectively allow; the name is shown across the product. */
export const MAX_ORG_NAME = 120;

const INTENT_MODES: readonly GoogleIntentMode[] = ["signin", "client", "freelancer"];

export function cleanOrgName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim().slice(0, MAX_ORG_NAME);
  return trimmed || undefined;
}

export function encodeGoogleIntent(intent: GoogleIntent): string {
  const body = JSON.stringify({ m: intent.mode, n: cleanOrgName(intent.orgName) });
  return Buffer.from(body, "utf8").toString("base64url");
}

/**
 * Reads the intent cookie back. It is set by our own server action, but it
 * travels through the browser, so it is parsed as untrusted input — and it
 * can only ever choose between the two roles anyone may sign up as.
 */
export function decodeGoogleIntent(value: string | undefined | null): GoogleIntent | null {
  if (!value) return null;
  try {
    const raw: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!raw || typeof raw !== "object") return null;
    const { m, n } = raw as { m?: unknown; n?: unknown };
    if (typeof m !== "string" || !INTENT_MODES.includes(m as GoogleIntentMode)) return null;
    return { mode: m as GoogleIntentMode, orgName: cleanOrgName(n) };
  } catch {
    return null;
  }
}

function signUpPage(intent: GoogleIntent | null): GoogleEntryPage {
  return intent?.mode === "freelancer" ? "/for-freelancers" : "/sign-up";
}

export function decideGoogleSignIn(input: {
  profile: GoogleProfileFacts;
  /** The user already linked to this Google account, if any. */
  byGoogleId: ExistingUser | null;
  /** Users whose email matches Google's, compared without case. */
  byEmail: ExistingUser[];
  intent: GoogleIntent | null;
}): GoogleDecision {
  const { profile, byGoogleId, byEmail, intent } = input;
  const sub = typeof profile.sub === "string" ? profile.sub.trim() : "";
  if (!sub) return { kind: "refuse", error: "GoogleProfileIncomplete", page: "/sign-in" };

  if (byGoogleId) return { kind: "sign-in", userId: byGoogleId.id };

  const email = typeof profile.email === "string" ? profile.email.trim() : "";
  if (!email) return { kind: "refuse", error: "GoogleProfileIncomplete", page: "/sign-in" };
  if (profile.emailVerified !== true) {
    return { kind: "refuse", error: "GoogleEmailUnverified", page: "/sign-in" };
  }

  if (byEmail.length > 1) return { kind: "refuse", error: "GoogleAccountConflict", page: "/sign-in" };
  const existing = byEmail[0];
  if (existing) {
    if (existing.googleId && existing.googleId !== sub) {
      return { kind: "refuse", error: "GoogleAccountMismatch", page: "/sign-in" };
    }
    return { kind: "link", userId: existing.id, googleId: sub };
  }

  if (!intent || intent.mode === "signin") {
    return { kind: "refuse", error: "GoogleNoAccount", page: signUpPage(intent) };
  }
  const orgName = cleanOrgName(intent.orgName);
  if (!orgName) return { kind: "refuse", error: "GoogleNeedsName", page: signUpPage(intent) };

  const name = typeof profile.name === "string" && profile.name.trim() ? profile.name.trim() : null;
  return intent.mode === "freelancer"
    ? { kind: "create", role: "FREELANCER", orgKind: "WORKSPACE", orgName, email, name, googleId: sub }
    : { kind: "create", role: "CLIENT", orgKind: "BUSINESS", orgName, email, name, googleId: sub };
}

/**
 * The sentence shown for an `?error=` on the sign-in and sign-up pages: the
 * codes above, plus the ones Auth.js itself sends there. Unknown codes get a
 * generic line rather than nothing, so a failed login never looks like a page
 * that simply reloaded.
 */
export function signInErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case "OAuthCallbackError":
    case "OAuthSignInError":
      return "Google sign-in didn't finish — it was cancelled, or Google returned an error. Try again, or use your email and password.";
    case "AccessDenied":
      return "That Google account couldn't be used to sign in to MAIRO.";
    case "OAuthAccountNotLinked":
    case "GoogleAccountMismatch":
      return "This email's MAIRO account is already linked to a different Google account. Continue with that one, or sign in with your password.";
    case "GoogleEmailUnverified":
      return "Google hasn't verified the email on that account, so it can't be used to sign in. Verify it with Google, or use your email and password.";
    case "GoogleProfileIncomplete":
      return "Google didn't share an email address for that account, so MAIRO couldn't sign you in.";
    case "GoogleAccountConflict":
      return "More than one MAIRO account matches that Google email. Sign in with your email and password instead.";
    case "GoogleNoAccount":
      return "There's no MAIRO account for that Google address yet. Fill in the name below, then continue with Google to create one.";
    case "GoogleNeedsName":
      return "Add a name first, then continue with Google.";
    case "CredentialsSignin":
      return "Invalid email or password.";
    default:
      return "Sign-in didn't work. Please try again.";
  }
}
