"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { activeOrganizationId } from "@/lib/active-org";
import { deniedFor } from "@/lib/members/authorize";
import { accessiblePixels, choosePixel, createPixelForBusiness, declinePixel, recheckPixelAccess, setLeadMeasurement } from "@/lib/tracking/pixel-setup";
import { leadMeasurementFrom } from "@/lib/tracking/pixel-rules";

// The Meta Pixel setup page's presses (app/dashboard/pixel). Each checks who's
// asking and acts on their own business only; tokens never leave the server.

export type PixelActionResult = { ok: true; message: string } | { ok: false; reason: string; error: string };

async function context() {
  const session = await auth();
  if (!session?.user?.organizationId) return null;
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  return { organizationId, userId: session.user.id ?? "unknown" };
}

function refresh() {
  for (const p of ["/dashboard/pixel", "/dashboard/tracking", "/dashboard/launch", "/dashboard/settings", "/dashboard"]) revalidatePath(p);
}

export type PixelOption = { id: string; name: string; owner: string | null; lastFiredAt: string | null; createdAt: string | null; unavailable: boolean; recommended: boolean; why: string; hosts: string[] };

/** The Pixels (Meta now also calls them datasets) the connected Meta account can use in this ad account. Nothing is chosen here. */
export async function listPixelsAction(): Promise<
  { ok: true; adAccountId: string; options: PixelOption[]; canCreate: boolean; missingForCreate: string[]; permissionsUnknown: boolean } | { ok: false; reason: string; error: string }
> {
  const ctx = await context();
  if (!ctx) return { ok: false, reason: "auth", error: "Sign in again to continue." };
  const r = await accessiblePixels(ctx.organizationId);
  if (!r.ok) return { ok: false, reason: r.reason, error: r.message };
  return {
    ok: true,
    adAccountId: r.data.adAccountId,
    canCreate: r.data.canCreate,
    missingForCreate: r.data.missingForCreate,
    permissionsUnknown: r.data.permissionsUnknown,
    options: r.data.choices.map((c) => ({
      id: c.id,
      name: c.name,
      owner: c.ownerBusiness?.name ?? null,
      lastFiredAt: c.lastFiredAt?.toISOString() ?? null,
      createdAt: c.createdAt?.toISOString() ?? null,
      unavailable: c.unavailable,
      recommended: c.recommended,
      why: c.why,
      hosts: c.hosts,
    })),
  };
}

/** The owner confirmed this Pixel, and the website it's for. */
export async function choosePixelAction(pixelId: string, websiteDomain: string | null): Promise<PixelActionResult> {
  const denied = await deniedFor("accounts.manage");
  if (denied) return { ok: false, reason: "role", error: denied };
  const ctx = await context();
  if (!ctx) return { ok: false, reason: "auth", error: "Sign in again to continue." };
  const r = await choosePixel(ctx.organizationId, ctx.userId, { pixelId, websiteDomain });
  refresh();
  if (!r.ok) return { ok: false, reason: r.reason, error: r.message };
  return {
    ok: true,
    message: r.data.already
      ? `You're already using “${r.data.name}”, so nothing changed${websiteDomain ? " except the website it's for" : ""}.`
      : `Connected “${r.data.name}” in MAIRO. That doesn't mean it's on your website yet — install it, then run the check below.`,
  };
}

export async function createPixelAction(websiteDomain: string | null): Promise<PixelActionResult> {
  const denied = await deniedFor("accounts.manage");
  if (denied) return { ok: false, reason: "role", error: denied };
  const ctx = await context();
  if (!ctx) return { ok: false, reason: "auth", error: "Sign in again to continue." };
  const r = await createPixelForBusiness(ctx.organizationId, ctx.userId, websiteDomain);
  refresh();
  if (!r.ok) return { ok: false, reason: r.reason, error: r.message };
  return {
    ok: true,
    message: r.data.reused
      ? `Meta had already created “${r.data.name}” from your earlier request, so MAIRO used it rather than making a second.`
      : `Meta created “${r.data.name}” (${r.data.id}) in your ad account and confirmed it. It isn't on your website yet — install it, then run the check below.`,
  };
}

export async function declinePixelAction(leadMeasurement: string | null): Promise<PixelActionResult> {
  const denied = await deniedFor("accounts.manage");
  if (denied) return { ok: false, reason: "role", error: denied };
  const ctx = await context();
  if (!ctx) return { ok: false, reason: "auth", error: "Sign in again to continue." };
  await declinePixel(ctx.organizationId, ctx.userId, leadMeasurementFrom(leadMeasurement));
  refresh();
  return { ok: true, message: "Saved: no Pixel connected. You can connect one here any time." };
}

export async function setLeadMeasurementAction(leadMeasurement: string | null): Promise<PixelActionResult> {
  const denied = await deniedFor("accounts.manage");
  if (denied) return { ok: false, reason: "role", error: denied };
  const ctx = await context();
  if (!ctx) return { ok: false, reason: "auth", error: "Sign in again to continue." };
  await setLeadMeasurement(ctx.organizationId, leadMeasurementFrom(leadMeasurement));
  refresh();
  return { ok: true, message: "Saved." };
}

export async function recheckPixelAction(): Promise<PixelActionResult> {
  const denied = await deniedFor("accounts.manage");
  if (denied) return { ok: false, reason: "role", error: denied };
  const ctx = await context();
  if (!ctx) return { ok: false, reason: "auth", error: "Sign in again to continue." };
  const r = await recheckPixelAccess(ctx.organizationId);
  refresh();
  if (!r.ok) return { ok: false, reason: r.reason, error: r.message };
  return r.data.accessible ? { ok: true, message: r.data.message } : { ok: false, reason: "access", error: r.data.message };
}
