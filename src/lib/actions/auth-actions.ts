"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { signIn, signOut } from "@/lib/auth";
import { ownerSetupTokenIsValid } from "@/lib/owner-setup-token";

const signUpSchema = z.object({
  name: z.string().min(1, "Name is required"),
  businessName: z.string().min(1, "Business name is required"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type AuthActionState = { error?: string } | undefined;

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

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
  redirect("/");
}
