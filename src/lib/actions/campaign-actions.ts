"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createMetaCampaign } from "@/lib/meta/campaigns";
import { loadMetaConnection } from "@/lib/meta/connection";
import { MetaApiError } from "@/lib/meta/client";
import { planFor } from "@/lib/plans";

const createCampaignSchema = z.object({
  name: z.string().min(1),
  objective: z.enum(["LEADS", "SALES", "AWARENESS", "TRAFFIC", "APP_PROMOTION"]),
  dailyBudget: z.coerce.number().min(1),
});

export type CampaignActionState = { error?: string } | undefined;

// Creates the campaign record, and pushes it live to Meta immediately if the
// organization has a connected ad account. Otherwise it's saved as a draft
// the MAIRO team can push once Meta is connected.
export async function createCampaignAction(
  _prevState: CampaignActionState,
  formData: FormData
): Promise<CampaignActionState> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not authenticated" };
  const organizationId = session.user.organizationId;

  const parsed = createCampaignSchema.safeParse({
    name: formData.get("name"),
    objective: formData.get("objective"),
    dailyBudget: formData.get("dailyBudget"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { name, objective, dailyBudget } = parsed.data;
  const dailyBudgetCents = Math.round(dailyBudget * 100);

  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { subscriptionTier: true },
  });
  if (!organization) return { error: "Organization not found" };

  // An archived campaign has been retired, so it doesn't hold a slot.
  const plan = planFor(organization.subscriptionTier);
  const activeCount = await db.campaign.count({
    where: { organizationId, status: { not: "ARCHIVED" } },
  });

  if (activeCount >= plan.limits.campaigns) {
    return {
      error: `The ${plan.name} plan runs ${plan.limits.campaigns} campaign${
        plan.limits.campaigns === 1 ? "" : "s"
      } at a time. Archive one to free up a slot, or upgrade for more.`,
    };
  }

  const metaAccount = await loadMetaConnection(organizationId);

  if (!metaAccount || metaAccount.status !== "CONNECTED") {
    await db.campaign.create({
      data: {
        organizationId,
        name,
        objective,
        dailyBudgetCents,
        status: "DRAFT",
      },
    });
    revalidatePath("/dashboard/campaigns");
    return undefined;
  }

  try {
    const metaCampaign = await createMetaCampaign({
      adAccountId: metaAccount.metaAdAccountId,
      accessToken: metaAccount.accessToken,
      name,
      goal: objective,
      dailyBudgetCents,
    });

    await db.campaign.create({
      data: {
        organizationId,
        metaAdAccountId: metaAccount.id,
        metaCampaignId: metaCampaign.id,
        name,
        objective,
        dailyBudgetCents,
        status: "PENDING_REVIEW",
      },
    });
  } catch (error) {
    const message =
      error instanceof MetaApiError
        ? `Meta rejected this campaign: ${error.message}`
        : "Failed to create campaign on Meta. Saved as a draft instead.";

    await db.campaign.create({
      data: {
        organizationId,
        metaAdAccountId: metaAccount.id,
        name,
        objective,
        dailyBudgetCents,
        status: "DRAFT",
      },
    });

    revalidatePath("/dashboard/campaigns");
    return { error: message };
  }

  revalidatePath("/dashboard/campaigns");
  return undefined;
}
