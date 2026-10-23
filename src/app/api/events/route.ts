import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { adClickIds, later, reportSiteEvent } from "@/lib/site-tracking";

// Public funnel events. Only names on the list, only these properties, only
// these values: no URLs, no free text, nothing personal. A visitor's repeat
// views count once a day.

const v = z.enum(["story", "classic"]);
const event = z.discriminatedUnion("name", [
  z.object({ name: z.literal("hero_view"), props: z.object({ variant: v }) }),
  z.object({ name: z.literal("hero_example"), props: z.object({ type: z.enum(["shop", "service", "appointments", "brands"]), variant: v }) }),
  z.object({ name: z.literal("hero_chapter"), props: z.object({ chapter: z.enum(["business", "understanding", "creatives", "editing", "approval", "results"]), variant: v }) }),
  z.object({ name: z.literal("hero_play"), props: z.object({ state: z.enum(["playing", "paused", "replay", "invite"]), variant: v }) }),
  z.object({ name: z.literal("preview_start"), props: z.object({ source: z.enum(["url", "manual", "example"]), variant: v }) }),
  z.object({ name: z.literal("preview_result"), props: z.object({ outcome: z.enum(["facts", "failed", "blocked", "manual"]), variant: v }) }),
  z.object({ name: z.literal("preview_complete"), props: z.object({ kind: z.enum(["shop", "service", "appointments"]), variant: v }) }),
  z.object({ name: z.literal("preview_save"), props: z.object({ variant: v }) }),
  z.object({ name: z.literal("preview_refine"), props: z.object({ variant: v }) }),
  z.object({ name: z.literal("hero_cta"), props: z.object({ cta: z.enum(["free_plan", "watch", "sign_up"]), variant: v }) }),
  z.object({ name: z.literal("tool_result"), props: z.object({ tool: z.string().regex(/^[a-z-]{3,40}$/) }) }),
  z.object({ name: z.literal("walkthrough"), props: z.object({ action: z.enum(["play", "chapter", "video"]) }) }),
]);
const body = z.object({ anonId: z.string().uuid().nullable().optional() }).and(event);

export async function POST(request: Request) {
  let parsed: z.infer<typeof body>;
  try {
    const raw = await request.text();
    if (raw.length > 2_000) return new NextResponse(null, { status: 413 });
    const r = body.safeParse(JSON.parse(raw));
    if (!r.success) return new NextResponse(null, { status: 400 });
    parsed = r.data;
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const anonId = parsed.anonId ?? null;
  const day = new Date().toISOString().slice(0, 10);
  const dedupeKey = parsed.name === "hero_view" && anonId ? `hero_view:${anonId}:${day}` : parsed.name === "preview_complete" && anonId ? `preview_complete:${anonId}:${day}` : null;
  try {
    await db.funnelEvent.create({ data: { name: parsed.name, anonId, propsJson: JSON.stringify(parsed.props), dedupeKey } });
    // A finished free plan is MAIRO's own ads' first result: a Lead to MAIRO's
    // pixel, once a visitor a day, after the response (lib/site-tracking.ts).
    if (parsed.name === "preview_complete" && anonId) {
      later(async () => reportSiteEvent({ event: "Lead", eventId: `lead-${anonId}-${day}`, path: "/preview", clickIds: await adClickIds(), fromRequest: true }));
    }
  } catch {
    // A repeat of a once-a-day event, or the database is busy: nothing to tell the visitor.
  }
  return new NextResponse(null, { status: 204 });
}
