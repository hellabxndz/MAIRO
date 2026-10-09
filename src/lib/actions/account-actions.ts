"use server";

import { auth, signOut } from "@/lib/auth";
import { closeAccount } from "@/lib/account/close";

// Self-serve account deletion, so the data deletion page describes something a
// user can actually do rather than an address they have to email and wait on.
// The order of what happens — running campaigns named, the Stripe
// subscription cancelled, files removed, records deleted — is in
// lib/account/close.ts.

export type DeleteAccountState = { error?: string; running?: { name: string; dailyBudgetCents: number }[] } | undefined;

export async function deleteAccountAction(_prev: DeleteAccountState, formData: FormData): Promise<DeleteAccountState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: "You're not signed in." };

  // Owners run the business; there is no self-serve path for deleting the
  // account that administers everyone else's.
  if (session.user.role === "OWNER") return { error: "Owner accounts can't be deleted from here." };

  const result = await closeAccount({
    userId,
    organizationId: session.user.organizationId ?? null,
    acknowledgedRunning: formData.get("acknowledgeRunning") === "yes",
  });
  if (!result.ok) return { error: result.error, ...(result.reason === "running-campaigns" ? { running: result.running } : {}) };

  await signOut({ redirectTo: "/?deleted=1" });
}
