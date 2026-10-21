import { NextResponse } from "next/server";
import { z } from "zod";
import { anonKeyFor, takeRefineQuota } from "@/lib/website/store";
import { savedPlanSchema } from "@/lib/preview/saved-plan";
import { MESSAGE_MAX } from "@/lib/preview/refine";
import { refineAiAvailable, refinePlan } from "@/lib/ai/plan-refine";

// "Do you like it? What would you change?" under the free AI ad plan: the
// owner's answer in, the changes MAIRO can make to the plan out (checked in
// lib/preview/refine.ts), with a short reply. The browser applies them and
// rewrites the ad concepts if needed (/api/tools/ad-plan); nothing is saved
// or logged here. Each AI reading counts against the visitor's refinements
// for the hour — over the limit, MAIRO's rules read it instead and say so.

const Input = z.object({ plan: savedPlanSchema, message: z.string().trim().min(1).max(MESSAGE_MAX) });

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 70_000) return NextResponse.json({ ok: false, error: "That's too long — say what you'd change in a sentence or two." }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  const parsed = Input.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Say what you'd change in a sentence or two." }, { status: 400 });
  const { plan, message } = parsed.data;

  let limited: string | null = null;
  if (refineAiAvailable()) {
    const anonKey = anonKeyFor(request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, request.headers.get("user-agent"));
    const quota = await takeRefineQuota(anonKey);
    if (!quota.ok) limited = quota.message;
  }
  const answer = limited ? await refinePlan(plan, message, { rulesOnly: true }) : await refinePlan(plan, message);
  return NextResponse.json({ ok: true, ...answer, limited });
}
