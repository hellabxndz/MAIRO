"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { deniedFor, currentMember } from "@/lib/members/authorize";
import { audit } from "@/lib/members/audit";
import { WORKSPACE_COOKIE } from "@/lib/members/workspace";
import { entitlementsFor } from "@/lib/entitlements";
import { hasActivePlan } from "@/lib/readiness";
import { planFor } from "@/lib/plans";
import { brandStartingPlan, brandsOf, payingBusinessOf } from "@/lib/brands";

// Adding, opening and removing the extra businesses a MAIRO Scale plan
// covers (lib/brands.ts). Every action re-reads the plan and the person's
// role from the database; nothing here trusts an id from the browser
// without checking it belongs to the business that pays.

export type BrandActionState = { error?: string } | undefined;

const COOKIE_OPTIONS = { path: "/", httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 180 };

const newBusinessSchema = z.object({
  name: z.string().trim().min(1, "Give the business a name.").max(120, "That name is too long."),
  website: z.string().trim().max(200, "That address is too long.").optional(),
});

/** The paying business this request acts for, and the person — or why not. */
async function payer(): Promise<{ userId: string; organizationId: string } | { error: string }> {
  // Adding a business adds to what the subscription covers: billing.manage.
  const denied = await deniedFor("billing.manage");
  if (denied) return { error: denied };
  const m = await currentMember();
  if (!m || m.actingAsClient) return { error: "Not signed in." };
  const parent = await payingBusinessOf(m.organizationId);
  if (parent) return { error: `Businesses are added from ${parent.name}, the business that pays for the plan.` };
  return { userId: m.userId, organizationId: m.organizationId };
}

export async function addBusinessAction(_prev: BrandActionState, formData: FormData): Promise<BrandActionState> {
  const who = await payer();
  if ("error" in who) return { error: who.error };

  const parsed = newBusinessSchema.safeParse({ name: formData.get("name"), website: formData.get("website") || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  const org = await db.organization.findUnique({
    where: { id: who.organizationId },
    select: { kind: true, timezone: true, subscriptionTier: true, subscriptionStatus: true, paymentRequired: true },
  });
  if (!org || org.kind !== "BUSINESS") return { error: "Only a business can add another business." };

  // The allowance is the plan's, on a live subscription — never the free
  // access that applies while billing isn't enforced.
  const ent = await entitlementsFor(who.organizationId);
  const live = org.subscriptionTier !== "NONE" && hasActivePlan({ ...org, paymentRequired: true });
  const allowance = live ? Math.max(0, ent.ad_account_limit - 1) : 0;
  const existing = (await brandsOf(who.organizationId)).length;
  if (existing >= allowance) {
    return {
      error:
        allowance === 0
          ? `More than one Meta ad account is part of ${planFor("SCALE_V2").name}. Upgrade to add up to two more businesses.`
          : `Your plan covers ${allowance + 1} Meta ad accounts — this business and ${allowance} more — and they're all in use.`,
    };
  }

  const plan = await brandStartingPlan(who.organizationId);
  const brand = await db.$transaction(async (tx) => {
    const created = await tx.organization.create({
      data: {
        name: parsed.data.name,
        website: parsed.data.website || null,
        timezone: org.timezone,
        parentId: who.organizationId,
        ...plan,
      },
      select: { id: true, name: true },
    });
    await tx.organizationMember.create({ data: { organizationId: created.id, userId: who.userId, role: "OWNER" } });
    return created;
  });
  await audit(who.organizationId, who.userId, "Added a business", brand.name, "Covered by this business's plan");

  // Straight into the new business: setting it up, and connecting its own
  // Meta ad account, happen inside it.
  (await cookies()).set(WORKSPACE_COOKIE, brand.id, COOKIE_OPTIONS);
  revalidatePath("/", "layout");
  redirect("/onboarding");
}

/** Opens one of the businesses on this plan — the paying one or a brand. Only one the person is on the team of. */
export async function openBusinessAction(formData: FormData): Promise<void> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/sign-in");
  const id = String(formData.get("organizationId") ?? "");
  const row = await db.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: id, userId } }, select: { id: true } });
  if (!row) redirect("/dashboard/settings/businesses");
  (await cookies()).set(WORKSPACE_COOKIE, id, COOKIE_OPTIONS);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/**
 * Removes a business added under the plan, with everything in it — its
 * campaigns' records, creatives, plan and stored Meta token. Refused while
 * anything is running on Meta, so removing it can't leave ads spending with
 * nobody in MAIRO able to see or pause them; and the name has to be typed.
 */
export async function removeBusinessAction(_prev: BrandActionState, formData: FormData): Promise<BrandActionState> {
  const who = await payer();
  if ("error" in who) return { error: who.error };
  const denied = await deniedFor("business.delete");
  if (denied) return { error: denied };

  const id = String(formData.get("organizationId") ?? "");
  const brand = (await brandsOf(who.organizationId)).find((b) => b.id === id);
  if (!brand) return { error: "That business isn't on this plan." };
  if (String(formData.get("confirm") ?? "").trim() !== brand.name) return { error: `Type ${brand.name} to confirm.` };

  const running = await db.platformCampaign.count({ where: { mairoCampaign: { organizationId: brand.id }, status: { in: ["ACTIVE", "PENDING_REVIEW"] } } });
  if (running > 0) {
    return { error: `${brand.name} has ${running === 1 ? "a campaign" : `${running} campaigns`} running or waiting on Meta. Pause ${running === 1 ? "it" : "them"} there first, so nothing keeps spending after it's removed.` };
  }

  await db.organization.delete({ where: { id: brand.id } });
  await audit(who.organizationId, who.userId, "Removed a business", brand.name);
  const store = await cookies();
  if (store.get(WORKSPACE_COOKIE)?.value === brand.id) store.delete(WORKSPACE_COOKIE);
  revalidatePath("/dashboard/settings/businesses");
  return undefined;
}
