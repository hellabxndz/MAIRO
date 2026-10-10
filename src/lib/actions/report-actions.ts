"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrg } from "@/lib/active-org";
import { generateWeeklyReport, lastWeekFor, newShareToken } from "@/lib/reports/weekly";
import { refreshDecisions } from "@/lib/decisions/run";

// What the Weekly Report screens call. Each checks the report or settings
// belong to the account asking.

async function context() {
  const session = await auth();
  if (!session?.user?.organizationId) return null;
  const active = await activeOrg();
  return {
    organizationId: active?.id ?? session.user.organizationId,
    actingAsClient: active?.actingAsClient ?? false,
    role: session.user.role,
  };
}

/** A report for the last seven days, now — without waiting for the delivery day. */
export async function generateWeeklyReportNowAction(): Promise<{ ok: false; error: string } | never> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not signed in." };
  const org = await db.organization.findUnique({ where: { id: ctx.organizationId }, select: { timezone: true } });
  const week = lastWeekFor(new Date(), org?.timezone || "America/New_York");
  let id: string;
  try {
    await refreshDecisions(ctx.organizationId).catch(() => undefined);
    id = (await generateWeeklyReport(ctx.organizationId, week)).id;
  } catch (error) {
    console.error("Weekly report on demand failed:", error);
    return { ok: false, error: "MAIRO couldn't write the report just now. Try again in a minute." };
  }
  revalidatePath("/dashboard/reports");
  revalidatePath("/dashboard");
  redirect(`/dashboard/reports/weekly/${id}`);
}

const settingsSchema = z.object({
  weeklyEnabled: z.boolean(),
  deliveryDay: z.number().int().min(0).max(6),
  preferredMode: z.enum(["simple", "advanced", "profit"]),
  inApp: z.boolean(),
  text: z.boolean(),
  onlyWhenActive: z.boolean(),
  brandName: z.string().trim().max(80).nullable(),
  brandLogoUrl: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .refine((v) => !v || /^https:\/\//.test(v), "The logo address must start with https://"),
  hideInternal: z.boolean(),
  autoApprove: z.boolean(),
});

export type ReportSettingsState = { ok: boolean; error: string | null };

export async function saveReportSettingsAction(_prev: ReportSettingsState, form: FormData): Promise<ReportSettingsState> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not signed in." };
  const on = (k: string) => form.get(k) === "on";
  const text = (k: string) => {
    const v = String(form.get(k) ?? "").trim();
    return v === "" ? null : v;
  };
  const parsed = settingsSchema.safeParse({
    weeklyEnabled: on("weeklyEnabled"),
    deliveryDay: Number(form.get("deliveryDay") ?? 1),
    preferredMode: String(form.get("preferredMode") ?? "simple"),
    inApp: on("inApp"),
    text: on("text"),
    onlyWhenActive: on("onlyWhenActive"),
    brandName: text("brandName"),
    brandLogoUrl: text("brandLogoUrl"),
    hideInternal: on("hideInternal"),
    autoApprove: on("autoApprove"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the settings." };
  const { text: wantsText, ...data } = parsed.data;
  await db.reportSettings.upsert({ where: { organizationId: ctx.organizationId }, create: { organizationId: ctx.organizationId, ...data }, update: data });
  // Texts go through the weekly-summary switch on the business's verified number.
  await db.smsPreference.updateMany({ where: { organizationId: ctx.organizationId }, data: { onWeeklySummary: wantsText } });
  revalidatePath("/dashboard/settings/reports");
  revalidatePath("/dashboard");
  return { ok: true, error: null };
}

/** An agency approving a client's report: now it can be shared by link. Nothing is sent. */
export async function approveReportAction(reportId: string): Promise<{ ok: boolean; token?: string }> {
  const ctx = await context();
  if (!ctx || !z.string().min(1).max(64).safeParse(reportId).success) return { ok: false };
  const report = await db.weeklyReport.findFirst({ where: { id: reportId, organizationId: ctx.organizationId } });
  if (!report) return { ok: false };
  const token = report.shareToken ?? newShareToken();
  await db.weeklyReport.update({ where: { id: report.id }, data: { approvedAt: report.approvedAt ?? new Date(), shareToken: token } });
  revalidatePath(`/dashboard/reports/weekly/${reportId}`);
  return { ok: true, token };
}

export async function revokeShareAction(reportId: string): Promise<{ ok: boolean }> {
  const ctx = await context();
  if (!ctx) return { ok: false };
  const res = await db.weeklyReport.updateMany({ where: { id: reportId, organizationId: ctx.organizationId }, data: { shareToken: null, approvedAt: null } });
  revalidatePath(`/dashboard/reports/weekly/${reportId}`);
  return { ok: res.count > 0 };
}

/** Switch a lesson off so MAIRO stops using it. */
export async function toggleLearningAction(id: string, active: boolean): Promise<{ ok: boolean }> {
  const ctx = await context();
  if (!ctx) return { ok: false };
  const res = await db.mairoLearning.updateMany({ where: { id, organizationId: ctx.organizationId }, data: { active } });
  revalidatePath("/dashboard/business");
  revalidatePath("/dashboard/settings/business-brain");
  return { ok: res.count > 0 };
}
