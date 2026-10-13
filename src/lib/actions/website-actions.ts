"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { activeOrganizationId } from "@/lib/active-org";
import { setFindingStatus } from "@/lib/website/store";

// The owner's decisions on the "Before you spend on ads" report. Scoped to the
// business the person is signed in to; a key from another business changes
// nothing.

const input = z.object({ key: z.string().min(3).max(300), status: z.enum(["OPEN", "RESOLVED", "DISMISSED"]) });

export async function setWebsiteFindingAction(raw: { key: string; status: "OPEN" | "RESOLVED" | "DISMISSED" }): Promise<{ ok: boolean }> {
  const session = await auth();
  if (!session?.user?.organizationId) return { ok: false };
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false };
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const ok = await setFindingStatus(organizationId, parsed.data.key, parsed.data.status, session.user.id ?? null);
  revalidatePath("/dashboard/website");
  return { ok };
}
