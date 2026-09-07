"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { startExploring } from "@/lib/explore-mode";
import { activeOrganizationId } from "@/lib/active-org";

export async function disconnectMetaAction() {
  const session = await auth();
  if (!session?.user?.organizationId) throw new Error("Not authenticated");

  const organizationId =
    (await activeOrganizationId()) ?? session.user.organizationId;

  await db.metaAdAccount.deleteMany({
    where: { organizationId: organizationId },
  });

  revalidatePath("/dashboard/meta");
  revalidatePath("/dashboard");
}

// Lets a signed-in client look around the dashboard before connecting Meta.
// See src/lib/explore-mode.ts for why this exists and why it is a cookie.
export async function exploreWithoutMetaAction() {
  await startExploring();
  redirect("/dashboard");
}
