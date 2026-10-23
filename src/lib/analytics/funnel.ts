import { cookies } from "next/headers";
import { db } from "@/lib/db";

// The funnel, recorded on the server for steps that happen there (a plan
// created, a launch approved) and counted for the AIOS comparison of hero
// versions. Plan completion is the measure that matters; views and clicks
// are supporting evidence only.

export const PUBLIC_EVENT_NAMES = ["hero_view", "hero_example", "hero_chapter", "hero_play", "preview_start", "preview_result", "preview_complete", "preview_save", "preview_refine", "hero_cta", "tool_result", "walkthrough"] as const;
export const SERVER_EVENT_NAMES = ["plan_created", "plan_approved", "checkout_success", "first_launch"] as const;

export async function heroVariantCookie(): Promise<string> {
  try {
    const v = (await cookies()).get("mairo_hero")?.value;
    return v === "classic" ? "classic" : "story";
  } catch {
    return "story";
  }
}

/** Records a once-per-business server step; true the first time. Never throws into the caller. */
export async function recordOnce(name: (typeof SERVER_EVENT_NAMES)[number], organizationId: string, props: Record<string, string> = {}): Promise<boolean> {
  try {
    await db.funnelEvent.create({ data: { name, organizationId, propsJson: JSON.stringify(props), dedupeKey: `${name}:${organizationId}` } });
    return true;
  } catch {
    // Already recorded (the dedupe key), or the table is unavailable: measurement never blocks the product.
    return false;
  }
}

export type VariantFunnel = { variant: string; views: number; previewStarts: number; previewCompletes: number; plansCreated: number; planRate: number | null };

/** Counts by hero version over the last `days` days. Plans created is the primary measure. */
export async function heroFunnel(days: number): Promise<VariantFunnel[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db.funnelEvent.findMany({ where: { createdAt: { gte: since }, name: { in: ["hero_view", "preview_start", "preview_complete", "plan_created"] } }, select: { name: true, propsJson: true } });
  const by = new Map<string, VariantFunnel>();
  for (const r of rows) {
    let variant = "story";
    try {
      variant = (JSON.parse(r.propsJson ?? "{}") as { variant?: string }).variant === "classic" ? "classic" : "story";
    } catch {
      // Old rows without a variant count as the current hero.
    }
    const f = by.get(variant) ?? { variant, views: 0, previewStarts: 0, previewCompletes: 0, plansCreated: 0, planRate: null };
    if (r.name === "hero_view") f.views++;
    if (r.name === "preview_start") f.previewStarts++;
    if (r.name === "preview_complete") f.previewCompletes++;
    if (r.name === "plan_created") f.plansCreated++;
    by.set(variant, f);
  }
  return [...by.values()].map((f) => ({ ...f, planRate: f.views ? f.plansCreated / f.views : null })).sort((a, b) => a.variant.localeCompare(b.variant));
}

// --- The whole funnel, through to staying subscribed --------------------------------
//
// Counts only: no names, emails or business details, just how many reached
// each step. The anonymous steps (a landing view, a preview) are per visitor;
// the rest are per business, recorded once each (the dedupe key). Staying
// subscribed is read from the subscription itself rather than recorded, so
// it can't drift from what Stripe says.

export const FUNNEL_STEPS = [
  { name: "hero_view", label: "Landing views" },
  { name: "preview_start", label: "Free plans started" },
  { name: "preview_complete", label: "Free plans finished" },
  { name: "plan_created", label: "Plans saved to an account" },
  { name: "plan_approved", label: "Plans approved" },
  { name: "checkout_success", label: "Subscribed" },
  { name: "first_launch", label: "First campaign live on Meta" },
] as const;

export type FunnelStep = { name: (typeof FUNNEL_STEPS)[number]["name"]; label: string; count: number; fromPrevious: number | null };

/** Pure: event names in, one count per step, with the share of the step before. */
export function tallyFunnel(names: string[]): FunnelStep[] {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return FUNNEL_STEPS.map((s, i) => {
    const count = counts.get(s.name) ?? 0;
    const before = i > 0 ? (counts.get(FUNNEL_STEPS[i - 1].name) ?? 0) : 0;
    return { name: s.name, label: s.label, count, fromPrevious: i > 0 && before > 0 ? count / before : null };
  });
}

export async function stepFunnel(days: number): Promise<FunnelStep[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db.funnelEvent.findMany({ where: { createdAt: { gte: since }, name: { in: FUNNEL_STEPS.map((s) => s.name) } }, select: { name: true } });
  return tallyFunnel(rows.map((r) => r.name));
}

export type Retention = { afterDays: number; eligible: number; retained: number; rate: number | null };

/** Pure: of the businesses that subscribed at least `afterDays` ago, how many are subscribed now. */
export function tallyRetention(rows: { subscribedAt: Date; status: string | null }[], afterDays: number, now = new Date()): Retention {
  const cutoff = now.getTime() - afterDays * 24 * 60 * 60 * 1000;
  const eligible = rows.filter((r) => r.subscribedAt.getTime() <= cutoff);
  const retained = eligible.filter((r) => r.status === "active" || r.status === "trialing").length;
  return { afterDays, eligible: eligible.length, retained, rate: eligible.length ? retained / eligible.length : null };
}

export async function retention(afterDays: number): Promise<Retention> {
  const rows = await db.funnelEvent.findMany({
    where: { name: "checkout_success", organizationId: { not: null } },
    select: { createdAt: true, organization: { select: { subscriptionStatus: true } } },
  });
  return tallyRetention(rows.map((r) => ({ subscribedAt: r.createdAt, status: r.organization?.subscriptionStatus ?? null })), afterDays);
}
