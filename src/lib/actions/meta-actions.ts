"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function disconnectMetaAction() {
  const session = await auth();
  if (!session?.user?.organizationId) throw new Error("Not authenticated");

  await db.metaAdAccount.deleteMany({
    where: { organizationId: session.user.organizationId },
  });

  revalidatePath("/dashboard/meta");
  revalidatePath("/dashboard");
}
