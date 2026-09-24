"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { signIn, signOut } from "@/lib/auth";
import { ownerSetupTokenIsValid } from "@/lib/owner-setup-token";
import { googleSignInEnabled, rememberGoogleIntent } from "@/lib/google-sign-in";
import type { GoogleIntentMode } from "@/lib/google-sign-in-rules";

const signUpSchema = z.object({
  name: z.string().min(1, "Name is required"),
  businessName: z.string().min(1, "Business name is required"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type AuthActionState = { error?: string } | undefined;

const freelancerSignUpSchema = z.object({
  name: z.string().min(1, "Name is required"),
  studioName: z.string().min(1, "Give your studio a name"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

/**
 * Signs up someone who runs ads for other people rather than for themselves.
 *
 * The difference from signUpAction is what gets created: a WORKSPACE
 * organization instead of a BUSINESS one. A workspace never runs ads itself —
 * it exists to hold the client businesses beneath it and to carry the
 * subscription that pays for them — so there is no onboarding intake, no Meta
 * connection and no campaigns at this level. Those all belong to the clients.
 */
export async function freelancerSignUpAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = freelancerSignUpSchema.safeParse({
    name: formData.get("name"),
    studioName: formData.get("studioName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { name, studioName, email, password } = parsed.data;

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "An account with that email already exists." };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await db.$transaction(async (tx) => {
    const workspace = await tx.organization.create({
      data: { name: studioName, kind: "WORKSPACE" },
    });
    await tx.user.create({
      data: { email, name, passwordHash, role: "FREELANCER", organizationId: workspace.id },
    });
  });

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Account created, but sign-in failed. Try signing in." };
    }
    throw error;
  }
  redirect("/clients");
}

export async function signUpAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = signUpSchema.safeParse({
    name: formData.get("name"),
    businessName: formData.get("businessName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { name, businessName, email, password } = parsed.data;

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "An account with that email already exists." };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await db.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: { name: businessName },
    });

    await tx.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: "CLIENT",
        organizationId: organization.id,
      },
    });
  });

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/onboarding",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Account created, but sign-in failed. Please sign in manually." };
    }
    throw error;
  }

  return undefined;
}

const createOwnerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

// First-run bootstrap: lets whoever gets here first create the OWNER account
// through the browser, no terminal/database access needed. Only works while
// zero OWNER accounts exist yet — see src/app/setup/page.tsx, which also
// redirects away once one does — unless a valid OWNER_SETUP_TOKEN is supplied,
// which additionally allows resetting an existing owner (see above).
export async function createOwnerAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = createOwnerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { name, email, password } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 10);

  const tokenValue = formData.get("token");
  const recovering = ownerSetupTokenIsValid(
    typeof tokenValue === "string" ? tokenValue : undefined
  );

  try {
    await db.$transaction(async (tx) => {
      const ownerCount = await tx.user.count({ where: { role: "OWNER" } });
      if (ownerCount > 0 && !recovering) {
        throw new Error("OWNER_EXISTS");
      }

      const existing = await tx.user.findUnique({ where: { email } });

      if (existing) {
        // Without a token this is a plain collision. With one, taking over the
        // named account is the whole point — that is how an owner login with a
        // lost password gets recovered.
        if (!recovering) throw new Error("EMAIL_TAKEN");

        await tx.user.update({
          where: { id: existing.id },
          data: { name, passwordHash, role: "OWNER" },
        });
      } else {
        await tx.user.create({
          data: { email, name, passwordHash, role: "OWNER" },
        });
      }

      // A recovery leaves exactly one owner. Any other OWNER rows are demoted,
      // so an account someone else created on the public first-run page cannot
      // keep owner access afterwards.
      if (recovering) {
        await tx.user.updateMany({
          where: { role: "OWNER", email: { not: email } },
          data: { role: "CLIENT" },
        });
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "OWNER_EXISTS") {
      return { error: "An owner account already exists. Go to /sign-in instead." };
    }
    if (error instanceof Error && error.message === "EMAIL_TAKEN") {
      return { error: "An account with that email already exists." };
    }
    throw error;
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/aios",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Account created, but sign-in failed. Please sign in manually." };
    }
    throw error;
  }

  return undefined;
}

export async function signInAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = formData.get("email");
  const password = formData.get("password");
  const requestedCallback = (formData.get("callbackUrl") as string) || "";

  if (typeof email !== "string") {
    return { error: "Invalid email or password." };
  }

  // A redirect triggered inside a server action is resolved client-side from
  // the action's response, without a fresh request — so proxy.ts (which
  // would otherwise bounce an OWNER away from /dashboard, or a CLIENT away
  // from /aios) never runs for it. Pick the right destination here instead
  // of leaning on the proxy to correct it after the fact.
  const targetUser = await db.user.findUnique({ where: { email }, select: { role: true } });
  const defaultPath = targetUser?.role === "OWNER" ? "/aios" : "/dashboard";
  const isSafeForRole =
    targetUser?.role === "OWNER"
      ? requestedCallback.startsWith("/aios")
      : requestedCallback.startsWith("/dashboard") || requestedCallback.startsWith("/onboarding");
  const redirectTo = isSafeForRole ? requestedCallback : defaultPath;

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    throw error;
  }

  return undefined;
}

/** Where a Google login from the sign-in page may land, same as the password form's rule. */
function safeCallback(value: FormDataEntryValue | null): string {
  const url = typeof value === "string" ? value : "";
  const allowed = ["/dashboard", "/onboarding", "/aios", "/clients"];
  return allowed.some((p) => url === p || url.startsWith(`${p}/`) || url.startsWith(`${p}?`)) ? url : "/dashboard";
}

/**
 * "Continue with Google", from any of the three entry pages. `rawMode` says
 * which one; for a sign-up it also carries the business or studio
 * name, since that is the one thing a new account needs that Google doesn't
 * know. Both ride along in a short-lived cookie that the signIn callback in
 * auth.ts reads when Google sends the person back.
 *
 * The destinations lean on the dashboard's own routing: /dashboard sends a new
 * business to onboarding, a freelancer to /clients, and the proxy sends an
 * owner to /aios — so an existing account reached through a sign-up button
 * still ends up in the right place.
 */
export async function googleSignInAction(rawMode: unknown, formData: FormData): Promise<void> {
  if (!googleSignInEnabled()) redirect("/sign-in");

  // Bound by the button rather than sent as its name/value: React leaves the
  // submitter out of the form data when a button's formAction is a server
  // action. It arrives from the browser either way, so it is checked here.
  const mode: GoogleIntentMode = rawMode === "client" || rawMode === "freelancer" ? rawMode : "signin";
  const orgName = formData.get(mode === "freelancer" ? "studioName" : "businessName");

  await rememberGoogleIntent({ mode, orgName: typeof orgName === "string" ? orgName : undefined });

  const redirectTo =
    mode === "freelancer" ? "/clients" : mode === "client" ? "/dashboard" : safeCallback(formData.get("callbackUrl"));
  // Throws the redirect to Google, which must not be caught.
  await signIn("google", { redirectTo });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
  redirect("/");
}
