"use server";

import { auth, signOut } from "@/lib/auth";
import { db } from "@/lib/db";

// Self-serve account deletion, so the data deletion page describes something a
// user can actually do rather than an address they have to email and wait on.
//
// Deleting the organization cascades to the intake, monthly plans, campaigns,
// creative requests, agent threads and — importantly — the stored Meta access
// token. The users are deleted first because User.organizationId is an optional
// relation, which would otherwise be nulled and leave orphaned logins behind.
export async function deleteAccountAction() {
  const session = await auth();
  const userId = session?.user?.id;
  const organizationId = session?.user?.organizationId;

  if (!userId) throw new Error("Not authenticated");

  // Owners run the business; there is no self-serve path for deleting the
  // account that administers everyone else's.
  if (session.user.role === "OWNER") {
    throw new Error("Owner accounts cannot be deleted from here.");
  }

  await db.$transaction(async (tx) => {
    if (organizationId) {
      await tx.user.deleteMany({ where: { organizationId } });
      await tx.organization.delete({ where: { id: organizationId } });
    } else {
      await tx.user.delete({ where: { id: userId } });
    }
  });

  await signOut({ redirectTo: "/?deleted=1" });
}
