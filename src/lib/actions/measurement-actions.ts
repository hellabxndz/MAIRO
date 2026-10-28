"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { activeOrganizationId } from "@/lib/active-org";
import { deniedFor } from "@/lib/members/authorize";
import { markInstalled, checkInstallation } from "@/lib/tracking/setup";
import { goalsFrom, installPlan, platformFrom, type GoalId, type Suggestion } from "@/lib/tracking/measurement";
import {
  chooseInstall,
  confirmPlatform,
  deferSetup,
  detectPlatformFor,
  resumeSetup,
  saveGoals,
  saveWebsiteAndDetect,
  suggestWithAi,
  verifyMeasurement,
} from "@/lib/tracking/measurement-store";
import { db } from "@/lib/db";

// The guided tracking setup's presses (app/dashboard/pixel). Each one checks
// who's asking and acts on their own business only; changing anything needs
// the same permission as connecting accounts. Tokens never leave the server.

export type MeasurementResult = { ok: true; message: string } | { ok: false; error: string };

async function context(): Promise<{ organizationId: string; userId: string } | null> {
  const session = await auth();
  if (!session?.user?.organizationId) return null;
  return { organizationId: (await activeOrganizationId()) ?? session.user.organizationId, userId: session.user.id ?? "unknown" };
}

async function allowed(): Promise<{ organizationId: string; userId: string } | { error: string }> {
  const denied = await deniedFor("accounts.manage");
  if (denied) return { error: denied };
  const ctx = await context();
  return ctx ?? { error: "Sign in again to continue." };
}

function refresh() {
  for (const p of ["/dashboard/pixel", "/dashboard/tracking", "/dashboard/launch", "/dashboard/settings", "/dashboard"]) revalidatePath(p);
}

export async function saveWebsiteAction(website: string): Promise<MeasurementResult> {
  const ctx = await allowed();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const r = await saveWebsiteAndDetect(ctx.organizationId, website);
  refresh();
  return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.message };
}

export async function detectPlatformAction(): Promise<MeasurementResult> {
  const ctx = await allowed();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const r = await detectPlatformFor(ctx.organizationId);
  refresh();
  return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.message };
}

export async function confirmPlatformAction(platform: string): Promise<MeasurementResult> {
  const ctx = await allowed();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const r = await confirmPlatform(ctx.organizationId, platform);
  refresh();
  return r.ok ? { ok: true, message: "Saved." } : { ok: false, error: r.message };
}

export async function suggestGoalsAction(): Promise<{ ok: true; suggestion: Suggestion; dropped: string[] } | { ok: false; error: string }> {
  const ctx = await allowed();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const r = await suggestWithAi(ctx.organizationId);
  return { ok: true, ...r };
}

export async function saveGoalsAction(goals: GoalId[]): Promise<MeasurementResult> {
  const ctx = await allowed();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const r = await saveGoals(ctx.organizationId, ctx.userId, goals);
  refresh();
  if (!r.ok) return { ok: false, error: r.message };
  return { ok: true, message: `Saved — measuring ${r.goals.length} thing${r.goals.length === 1 ? "" : "s"}.` };
}

export async function deferSetupAction(): Promise<MeasurementResult> {
  const ctx = await allowed();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  await deferSetup(ctx.organizationId);
  refresh();
  return { ok: true, message: "Saved for later. Nothing is measured until you finish." };
}

export async function resumeSetupAction(): Promise<MeasurementResult> {
  const ctx = await allowed();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  await resumeSetup(ctx.organizationId);
  refresh();
  return { ok: true, message: "Picked up where you left off." };
}

/** The install route for the platform the owner confirmed. Choosing it installs nothing. */
export async function chooseInstallAction(): Promise<MeasurementResult> {
  const ctx = await allowed();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const profile = await db.trackingProfile.findUnique({ where: { organizationId: ctx.organizationId }, select: { sitePlatform: true, measurementGoals: true } });
  const platform = platformFrom(profile?.sitePlatform);
  if (!platform) return { ok: false, error: "Confirm your website's platform first." };
  const goals = goalsFrom(profile?.measurementGoals);
  await chooseInstall(ctx.organizationId, installPlan(platform, goals).method, platform);
  refresh();
  return { ok: true, message: "Here are your steps. Nothing is installed until you do them." };
}

/** "I've done it": recorded as the owner's word, then checked — the check, not the click, decides. */
export async function markInstalledAction(): Promise<MeasurementResult> {
  const ctx = await allowed();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  await markInstalled(ctx.organizationId);
  const r = await checkInstallation(ctx.organizationId);
  refresh();
  if (!r.ok) return { ok: false, error: r.message };
  return {
    ok: true,
    message: r.data.status === "VERIFIED" ? "MAIRO can see your tracking. Now check each event with Meta." : "Noted. MAIRO can't see it on your website yet — that's normal for Shopify and some builders. Check each event with Meta next.",
  };
}

export async function verifyMeasurementAction(): Promise<MeasurementResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Sign in again to continue." };
  const r = await verifyMeasurement(ctx.organizationId);
  refresh();
  return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.message };
}
