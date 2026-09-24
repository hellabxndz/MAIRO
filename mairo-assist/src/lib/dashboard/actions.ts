"use server";

import { cookies } from "next/headers";
import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordActivity, recordAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/session";
import { isSupabaseAdminConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_BUSINESS_COOKIE, authorize, listMemberships, PermissionError } from "@/lib/tenancy/context";

export type ActionResult = { ok: boolean; message: string };

/** Switch the active business — only to one the user is a member of. */
export async function switchBusiness(businessId: string): Promise<void> {
  const user = await requireUser();
  const memberships = await listMemberships();
  if (!memberships.some((m) => m.business.id === businessId)) return;
  (await cookies()).set(ACTIVE_BUSINESS_COOKIE, businessId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  const supabase = await createClient();
  await supabase.from("users").update({ last_business_id: businessId }).eq("id", user.id);
  redirect("/dashboard");
}

export async function setDashboardView(view: "simple" | "advanced"): Promise<void> {
  if (view !== "simple" && view !== "advanced") return;
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.from("users").update({ dashboard_view: view }).eq("id", user.id);
  refresh();
}

/**
 * Pause or resume the AI employee. Pausing is always allowed. Resuming is
 * only allowed once a configuration has been published AND tested in
 * preview (the database enforces the same rule).
 */
export async function setAiStatus(target: "active" | "paused"): Promise<ActionResult> {
  let ctx;
  try {
    ctx = await authorize("ai.toggle");
  } catch (e) {
    if (e instanceof PermissionError) return { ok: false, message: "You don't have permission to change the AI status." };
    throw e;
  }
  if (target !== "active" && target !== "paused") return { ok: false, message: "Unknown status." };
  if (!isSupabaseAdminConfigured()) return { ok: false, message: "Server credentials are not configured." };

  const admin = createAdminClient();
  const { data: employee } = await admin
    .from("ai_employees")
    .select("id, status, tested_at, published_version_id")
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (!employee) return { ok: false, message: "Set up your AI employee first." };

  if (target === "active" && (!employee.published_version_id || !employee.tested_at)) {
    return { ok: false, message: "Test and publish your AI employee before switching it on." };
  }
  if (employee.status === target) return { ok: true, message: target === "active" ? "Already active." : "Already paused." };
  if (target === "paused" && employee.status === "draft") return { ok: true, message: "Your AI employee isn't live yet." };

  const now = new Date().toISOString();
  const { error } = await admin
    .from("ai_employees")
    .update(target === "active" ? { status: "active", activated_at: now } : { status: "paused", paused_at: now })
    .eq("id", employee.id)
    .eq("business_id", ctx.business.id);
  if (error) return { ok: false, message: "We couldn't change the status. Please try again." };

  await Promise.all([
    recordAudit({ businessId: ctx.business.id, actorUserId: ctx.user.id, action: `ai_employee.${target === "active" ? "resumed" : "paused"}`, targetType: "ai_employee", targetId: employee.id }),
    recordActivity({ businessId: ctx.business.id, type: target === "active" ? "ai_resumed" : "ai_paused", summary: target === "active" ? "AI employee was switched on." : "AI employee was paused." }),
  ]);
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: target === "active" ? "Your AI employee is active." : "Your AI employee is paused." };
}
