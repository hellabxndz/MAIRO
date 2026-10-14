import { NextResponse } from "next/server";
import { z } from "zod";
import { anonKeyFor, takePlanQuota } from "@/lib/website/store";
import { planWriterAvailable, writePlan } from "@/lib/ai/ad-plan";
import { buildPreview, emptyFacts, kindOf, type PreviewFacts } from "@/lib/preview/build";
import { conceptFromDirection } from "@/lib/preview/plan-writing";
import { BUDGET_MAX, BUDGET_MIN } from "@/lib/preview/strategy";
import { businessTypeFrom } from "@/lib/onboarding/business-types";

// The free AI ad plan's writing, before there's an account: the facts the
// visitor confirmed (typed, or read from their website), their goal and
// monthly Meta budget in; what makes the business appealing, who's likely to
// buy, what the ads should say and three checked ad concepts out.
//
// Free and open, so it's limited: a few plans an hour per visitor and a daily
// ceiling across everyone, counted by a salted one-way hash rather than an IP
// address. Over a limit, or when the AI isn't switched on or doesn't answer,
// the visitor still gets their plan — written from MAIRO's templates, and it
// says so. Nothing the visitor typed is stored or logged here.

const line = (max: number) => z.string().trim().max(max).default("");
const Input = z.object({
  facts: z.object({
    name: line(90),
    offering: z.string().trim().min(3).max(400),
    customer: line(120),
    location: line(120),
    offer: line(120),
    proof: line(160),
    problem: line(160),
    businessType: line(40),
    website: z.string().trim().max(300).nullable().default(null),
    fromWebsite: z.array(z.enum(["name", "offering", "customer", "location", "offer", "proof", "problem"])).max(7).default([]),
  }),
  goal: z.enum(["sales", "leads", "bookings", "traffic", "awareness"]),
  monthly: z.number().int().min(BUDGET_MIN).max(BUDGET_MAX),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  const parsed = Input.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Tell MAIRO what your business sells, your goal and your monthly budget." }, { status: 400 });
  const { facts: x, goal, monthly } = parsed.data;

  const facts: PreviewFacts = { ...emptyFacts(x.website), name: x.name, offering: x.offering, customer: x.customer, location: x.location, offer: x.offer, proof: x.proof, problem: x.problem, businessType: businessTypeFrom(x.businessType)?.id ?? "", typeFrom: x.businessType ? "you" : null, goal, monthlyBudget: monthly, sources: {} };
  for (const k of ["name", "offering", "customer", "location", "offer", "proof", "problem"] as const) if (facts[k]) facts.sources[k] = x.fromWebsite.includes(k) ? { from: "website", url: x.website, quote: null } : { from: "you" };
  const preview = buildPreview(facts, { quick: true });
  if (!preview) return NextResponse.json({ ok: false, error: "Tell MAIRO what your business sells." }, { status: 400 });
  const kind = kindOf(facts);
  const kindLabel = businessTypeFrom(facts.businessType)?.label ?? (kind === "shop" ? "an online shop" : kind === "appointments" ? "a business that takes bookings" : "a local service");
  const fallback = preview.directions.map((d) => conceptFromDirection(d, goal, facts.customer || preview.plan.audience.split(",")[0]));

  if (!planWriterAvailable()) return NextResponse.json({ ok: true, source: { by: "templates", why: "off" }, plan: null, dropped: [], filled: 0 });
  const anonKey = anonKeyFor(request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, request.headers.get("user-agent"));
  const quota = await takePlanQuota(anonKey);
  if (!quota.ok) return NextResponse.json({ ok: true, source: { by: "templates", why: quota.reason === "visitor" ? "limit" : "budget" }, message: quota.message, plan: null, dropped: [], filled: 0 });

  const r = await writePlan({ facts, goal, monthly, kindLabel, fallback });
  return NextResponse.json({ ok: true, ...r });
}
