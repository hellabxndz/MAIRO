"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { signIn, signOut } from "@/lib/auth";

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
