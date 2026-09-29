"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { gatherDecisionInput } from "@/lib/decisions/gather";
import { computeBrief, loadIntelligence } from "@/lib/intelligence/run";
import type { IntelligenceReportData } from "@/lib/intelligence/types";
import { DASHBOARD_LENS_COOKIE } from "@/lib/view-mode";

// What the intelligence screens call. Every one checks the row belongs to the
// account asking, as the decision actions do.

async function context() {
  const session = await auth();
  if (!session?.user?.organizationId) return null;
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  return { organizationId, userId: session.user.id ?? null };
}

/** "Don't show me this again" for one finding. It stays in the timeline. */
export async function dismissInsightAction(id: string): Promise<{ ok: boolean }> {
  const ctx = await context();
  if (!ctx || !z.string().min(1).max(64).safeParse(id).success) return { ok: false };
  const res = await db.mairoInsight.updateMany({ where: { id, organizationId: ctx.organizationId }, data: { status: "DISMISSED" } });
  revalidatePath("/dashboard");
  return { ok: res.count > 0 };
}

/**
 * Daily or weekly Morning Brief. Rebuilds just the brief — one read of the
 * account, not the whole daily look — so the choice shows at once.
 */
export async function setBriefFrequencyAction(frequency: "DAILY" | "WEEKLY"): Promise<{ ok: boolean }> {
  const ctx = await context();
  const parsed = z.enum(["DAILY", "WEEKLY"]).safeParse(frequency);
  if (!ctx || !parsed.success) return { ok: false };
  await db.organization.update({ where: { id: ctx.organizationId }, data: { briefFrequency: parsed.data } });
  try {
    const [input, current] = await Promise.all([gatherDecisionInput(ctx.organizationId), loadIntelligence(ctx.organizationId)]);
    if (current.report) {
      const brief = await computeBrief(ctx.organizationId, input, current.insights, parsed.data);
      const next: IntelligenceReportData = { ...current.report, brief };
      await db.intelligenceReport.update({ where: { organizationId: ctx.organizationId }, data: { reportJson: JSON.stringify(next) } });
    }
  } catch (error) {
    console.error("Brief rebuild failed:", error);
  }
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Profit First on or off. Simple and Advanced are the app-wide switch; this is the dashboard's third view. */
export async function setDashboardLensAction(lens: "profit" | "none"): Promise<void> {
  const jar = await cookies();
  if (lens === "profit") jar.set(DASHBOARD_LENS_COOKIE, "profit", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  else jar.delete(DASHBOARD_LENS_COOKIE);
  revalidatePath("/dashboard");
}

const money = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Math.round(Number(v.replace(/[$,]/g, "")) * 100)))
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 100_000_000), "Enter an amount in dollars.");

const percent = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v.replace("%", ""))))
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 100), "Enter a percentage from 0 to 100.");

const settingsSchema = z.object({
  averageMarginPercent: percent,
  sellingPrice: money,
  productCost: money,
  averageOrderValue: money,
  shippingCost: money,
  paymentFeePercent: percent,
  paymentFeeFixed: money,
  otherMonthlyCosts: money,
});

export type ProfitSettingsState = { ok: boolean; error: string | null };

export async function saveProfitSettingsAction(_prev: ProfitSettingsState, form: FormData): Promise<ProfitSettingsState> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not signed in." };
  const read = (k: string) => String(form.get(k) ?? "");
  const parsed = settingsSchema.safeParse({
    averageMarginPercent: read("averageMarginPercent"),
    sellingPrice: read("sellingPrice"),
    productCost: read("productCost"),
    averageOrderValue: read("averageOrderValue"),
    shippingCost: read("shippingCost"),
    paymentFeePercent: read("paymentFeePercent"),
    paymentFeeFixed: read("paymentFeeFixed"),
    otherMonthlyCosts: read("otherMonthlyCosts"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the numbers." };
  const d = parsed.data;
  if (d.sellingPrice !== null && d.productCost !== null && d.productCost > d.sellingPrice) {
    return { ok: false, error: "The product cost is higher than the selling price." };
  }
  const data = {
    averageMarginPercent: d.averageMarginPercent,
    sellingPriceCents: d.sellingPrice,
    productCostCents: d.productCost,
    averageOrderValueCents: d.averageOrderValue,
    shippingCostCents: d.shippingCost ?? 0,
    paymentFeePercent: d.paymentFeePercent ?? 2.9,
    paymentFeeFixedCents: d.paymentFeeFixed ?? 30,
    otherMonthlyCostsCents: d.otherMonthlyCosts ?? 0,
  };
  await db.profitSettings.upsert({ where: { organizationId: ctx.organizationId }, create: { organizationId: ctx.organizationId, ...data }, update: data });

  // Per-product costs: product-cost-<id>. Only this account's products are touched.
  const costs = [...form.entries()]
    .filter(([k]) => k.startsWith("product-cost-"))
    .map(([k, v]) => ({ id: k.slice("product-cost-".length), value: money.safeParse(String(v)) }))
    .filter((x) => x.value.success);
  for (const c of costs.slice(0, 100)) {
    await db.product.updateMany({ where: { id: c.id, organizationId: ctx.organizationId }, data: { costCents: c.value.success ? c.value.data : null } });
  }
  revalidatePath("/dashboard");
  return { ok: true, error: null };
}
