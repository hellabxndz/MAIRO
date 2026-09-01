"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { currentMonthKey } from "@/lib/utils/month";
import { planFor } from "@/lib/plans";

const requestSchema = z.object({
  type: z.enum(["IMAGE", "VIDEO", "COPY", "CAROUSEL"]),
  brief: z.string().min(5, "Give us a bit more detail"),
});

export type CreativeActionState = { error?: string } | undefined;

export async function requestCreativeAction(
  _prevState: CreativeActionState,
  formData: FormData
): Promise<CreativeActionState> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not authenticated" };

  const parsed = requestSchema.safeParse({
    type: formData.get("type"),
    brief: formData.get("brief"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const organizationId = session.user.organizationId;
  const month = currentMonthKey();

  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { subscriptionTier: true },
  });
  if (!organization) return { error: "Organization not found" };

  const plan = planFor(organization.subscriptionTier);
  const usedThisMonth = await db.creativeRequest.count({
    where: { organizationId, month },
  });

  if (usedThisMonth >= plan.limits.creativesPerMonth) {
    return {
      error: `You've used all ${plan.limits.creativesPerMonth} creative requests on the ${plan.name} plan this month. They reset on the 1st — or upgrade for more.`,
    };
  }

  await db.creativeRequest.create({
    data: {
      organizationId,
      month,
      type: parsed.data.type,
      brief: parsed.data.brief,
    },
  });

  revalidatePath("/dashboard/creatives");
  return undefined;
}
