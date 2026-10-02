"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { activeOrganizationId } from "@/lib/active-org";
import { changeBrain, type ChangeOutcome } from "@/lib/brain/store";
import type { FactChange } from "@/lib/brain/edit";

// The Business Brain page's View · Correct · Update · Remove. Everything the
// owner does here is their own word: confirmed, and never overwritten by
// something MAIRO infers later. Scoped to the signed-in organization.

const OPS = new Set(["set", "add", "remove", "confirm", "product", "remove-product"]);

export async function brainChangeAction(change: FactChange): Promise<ChangeOutcome> {
  const session = await auth();
  if (!session?.user?.organizationId) return { ok: false, error: "Not signed in." };
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  if (!change || typeof change !== "object" || !OPS.has(change.op)) return { ok: false, error: "That change isn't possible." };
  const result = await changeBrain(organizationId, change, "customer");
  revalidatePath("/dashboard/settings/business-brain");
  revalidatePath("/dashboard");
  return result;
}
