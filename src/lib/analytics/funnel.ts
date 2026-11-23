import { cookies } from "next/headers";
import { db } from "@/lib/db";

// The funnel, recorded on the server for steps that happen there (a plan
// created, a launch approved) and counted for the AIOS comparison of hero
// versions. Plan completion is the measure that matters; views and clicks
// are supporting evidence only.

export const PUBLIC_EVENT_NAMES = ["hero_view", "hero_example", "hero_chapter", "hero_play", "preview_start", "preview_result", "preview_complete", "preview_save", "preview_refine", "hero_cta", "tool_result", "walkthrough"] as const;
export const SERVER_EVENT_NAMES = ["plan_created", "plan_approved", "checkout_start", "checkout_success", "meta_connected", "tracking_ready", "launch_approved", "first_launch", "first_result", "next_test_approved"] as const;

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

// From the first look to the first follow-up test. `segment` marks a step
// only some businesses take (purchase tracking is for shops): it's counted,
// but the step after it is compared with the last step everyone takes, so
// lead businesses don't read as a leak.
export const FUNNEL_STEPS = [
  { name: "hero_view", label: "Landing views" },
  { name: "preview_start", label: "First ads started (website entered)" },
  { name: "preview_complete", label: "First ads shown" },
  { name: "plan_created", label: "Accounts created with their plan" },
  { name: "plan_approved", label: "Plans approved" },
  { name: "checkout_start", label: "Checkout started" },
  { name: "checkout_success", label: "Subscribed" },
  { name: "meta_connected", label: "Meta ad account connected" },
  { name: "tracking_ready", label: "Purchase tracking verified (shops)", segment: true },
  { name: "launch_approved", label: "First launch approved" },
  { name: "first_launch", label: "First campaign live on Meta" },
  { name: "first_result", label: "First result reported by Meta" },
  { name: "next_test_approved", label: "First follow-up test approved" },
] as const;

export type FunnelStep = { name: (typeof FUNNEL_STEPS)[number]["name"]; label: string; count: number; fromPrevious: number | null };

/** Pure: event names in, one count per step, with the share of the step before (skipping segment-only steps). */
export function tallyFunnel(names: string[]): FunnelStep[] {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return FUNNEL_STEPS.map((s, i) => {
    const count = counts.get(s.name) ?? 0;
    let j = i - 1;
    while (j >= 0 && "segment" in FUNNEL_STEPS[j] && !("segment" in s)) j--;
    const before = j >= 0 ? (counts.get(FUNNEL_STEPS[j].name) ?? 0) : 0;
    return { name: s.name, label: s.label, count, fromPrevious: i > 0 && before > 0 ? count / before : null };
  });
}

// --- Time to value ---------------------------------------------------------------
//
// Medians, so one stalled account doesn't hide how long most take: how long a
// visitor waits from entering a website to seeing their first ad (the same
// anonymous id, same day), and how long a business takes from signing up to
// its first live campaign and first reported result.

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Pure: seconds from each visitor's first "started" to their first "shown" after it. */
export function previewSeconds(rows: { name: string; anonId: string | null; at: Date }[]): number[] {
  const start = new Map<string, number>();
  const out: number[] = [];
  const done = new Set<string>();
  for (const r of [...rows].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    if (!r.anonId) continue;
    if (r.name === "preview_start" && !start.has(r.anonId)) start.set(r.anonId, r.at.getTime());
    if (r.name === "preview_complete" && start.has(r.anonId) && !done.has(r.anonId)) {
      const s = (r.at.getTime() - start.get(r.anonId)!) / 1000;
      if (s >= 0 && s < 6 * 3600) out.push(s);
      done.add(r.anonId);
    }
  }
  return out;
}

export type TimeToValue = { previewSeconds: number | null; previews: number; hoursToLive: number | null; live: number; hoursToResult: number | null; results: number };

export async function timeToValue(days: number): Promise<TimeToValue> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [anon, steps] = await Promise.all([
    db.funnelEvent.findMany({ where: { createdAt: { gte: since }, name: { in: ["preview_start", "preview_complete"] }, anonId: { not: null } }, select: { name: true, anonId: true, createdAt: true }, take: 20_000 }),
    db.funnelEvent.findMany({ where: { createdAt: { gte: since }, name: { in: ["first_launch", "first_result"] }, organizationId: { not: null } }, select: { name: true, createdAt: true, organization: { select: { createdAt: true } } } }),
  ]);
  const secs = previewSeconds(anon.map((r) => ({ name: r.name, anonId: r.anonId, at: r.createdAt })));
  const hours = (n: string) => steps.filter((s) => s.name === n && s.organization).map((s) => (s.createdAt.getTime() - s.organization!.createdAt.getTime()) / 3_600_000);
  const live = hours("first_launch");
  const res = hours("first_result");
  return { previewSeconds: median(secs), previews: secs.length, hoursToLive: median(live), live: live.length, hoursToResult: median(res), results: res.length };
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
