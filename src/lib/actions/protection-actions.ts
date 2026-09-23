"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { monthlyCapReached, pauseMairoCampaign, resumeMairoCampaign } from "@/lib/protection/run";

// The customer's own controls: their spending limits, and pausing or resuming
// a campaign by hand. Every query is scoped to the signed-in organization.

async function scope(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.organizationId) return null;
  return (await activeOrganizationId()) ?? session.user.organizationId;
}

export type ProtectionFormState = { error?: string; saved?: boolean } | undefined;

const schema = z.object({
  stopLossOn: z.boolean(),
  stopLoss: z.coerce.number().min(5, "Set the no-results limit to at least $5.").max(100000),
  stopLossAction: z.enum(["NOTIFY", "PAUSE"]),
  capOn: z.boolean(),
  monthlyCap: z.coerce.number().min(10, "Set the monthly limit to at least $10.").max(10_000_000),
  warnAtPercent: z.coerce.number().int().min(50).max(95),
});

export async function saveSpendProtectionAction(_prev: ProtectionFormState, formData: FormData): Promise<ProtectionFormState> {
  const organizationId = await scope();
  if (!organizationId) return { error: "Not signed in." };
  const parsed = schema.safeParse({
    stopLossOn: formData.get("stopLossOn") === "on",
    stopLoss: formData.get("stopLoss") || 50,
    stopLossAction: formData.get("stopLossAction") || "NOTIFY",
    capOn: formData.get("capOn") === "on",
    monthlyCap: formData.get("monthlyCap") || 10,
    warnAtPercent: formData.get("warnAtPercent") || 80,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the limits and try again." };
  const d = parsed.data;
  const data = {
    stopLossCents: d.stopLossOn ? Math.round(d.stopLoss * 100) : null,
    stopLossAction: d.stopLossAction,
    monthlyCapCents: d.capOn ? Math.round(d.monthlyCap * 100) : null,
    warnAtPercent: d.warnAtPercent,
  };
  await db.spendProtection.upsert({ where: { organizationId }, create: { organizationId, ...data }, update: data });
  revalidatePath("/dashboard/settings");
  return { saved: true };
}

export async function pauseCampaignAction(mairoCampaignId: string): Promise<{ error?: string } | undefined> {
  const organizationId = await scope();
  if (!organizationId) return { error: "Not signed in." };
  const owned = await db.mairoCampaign.findFirst({ where: { id: mairoCampaignId, organizationId }, select: { name: true } });
  if (!owned) return { error: "Campaign not found." };
  const result = await pauseMairoCampaign(organizationId, mairoCampaignId);
  await db.protectionEvent.create({
    data: {
      organizationId,
      mairoCampaignId,
      kind: "PAUSED_BY_YOU",
      action: result.ok ? "PAUSED" : "NOTIFIED",
      message: result.ok ? `You paused “${owned.name}”.` : `You asked to pause “${owned.name}”, and a network refused: ${result.error}`,
    },
  });
  revalidatePath(`/dashboard/campaigns/${mairoCampaignId}`);
  revalidatePath("/dashboard/campaigns");
  return result.ok ? undefined : { error: result.error };
}

export async function resumeCampaignAction(mairoCampaignId: string): Promise<{ error?: string } | undefined> {
  const organizationId = await scope();
  if (!organizationId) return { error: "Not signed in." };
  const owned = await db.mairoCampaign.findFirst({ where: { id: mairoCampaignId, organizationId }, select: { name: true } });
  if (!owned) return { error: "Campaign not found." };
  // A limit the customer set isn't overridden by a click elsewhere.
  const cap = await monthlyCapReached(organizationId).catch(() => ({ reached: false as const }));
  if (cap.reached) {
    return { error: `${cap.message ?? "Your monthly limit is reached."} Raise it in Settings → Spend Protection to resume.` };
  }
  const result = await resumeMairoCampaign(organizationId, mairoCampaignId);
  await db.protectionEvent.create({
    data: {
      organizationId,
      mairoCampaignId,
      kind: "RESUMED",
      action: result.ok ? "RESUMED" : "NOTIFIED",
      message: result.ok ? `You switched “${owned.name}” back on.` : `You asked to resume “${owned.name}”: ${result.error}`,
    },
  });
  revalidatePath(`/dashboard/campaigns/${mairoCampaignId}`);
  revalidatePath("/dashboard/campaigns");
  return result.ok ? undefined : { error: result.error };
}
