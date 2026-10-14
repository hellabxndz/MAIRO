import { NextResponse } from "next/server";
import { z } from "zod";
import { anonKeyFor, takeRefineQuota } from "@/lib/website/store";
import { rewriteAvailable, rewriteWords } from "@/lib/ai/rewrite-words";
import { BUTTONS } from "@/lib/creative/rewrite-rules";

// "Refine with MAIRO" on the free plan, before there's an account: one change
// to one suggested ad's words, in plain language ("make it more premium",
// "focus on the offer"). The same AI rewrite the signed-in Creative Studio
// uses, held to the same checks — it may use only the facts the visitor
// confirmed, and nothing is saved here: the browser shows the proposal and
// the visitor decides whether to keep it.
//
// Limited per visitor and per day, since each one is a model call. Nothing
// the visitor typed is stored; the quota keys on a salted hash, not an IP.

const Input = z.object({
  instruction: z.string().trim().min(3).max(240),
  direction: z.object({ label: z.string().max(60), hook: z.string().max(200), body: z.string().max(600), cta: z.string().max(30) }),
  facts: z.object({
    name: z.string().max(90),
    offering: z.string().max(140),
    customer: z.string().max(90).default(""),
    location: z.string().max(90).default(""),
    offer: z.string().max(90).default(""),
    proof: z.string().max(90).default(""),
    problem: z.string().max(90).default(""),
  }),
});

const toButton = (cta: string) => (BUTTONS as readonly string[]).includes(cta) ? cta : cta === "Get quote" ? "Get a quote" : "Learn more";

export async function POST(request: Request) {
  if (!rewriteAvailable()) {
    return NextResponse.json({ ok: false, error: "Refining with MAIRO's AI isn't switched on here yet. You can still change any detail yourself, or create your free account and refine your plan there." }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  const parsed = Input.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Say what you'd like changed in a few words." }, { status: 400 });
  const anonKey = anonKeyFor(request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, request.headers.get("user-agent"));
  const quota = await takeRefineQuota(anonKey);
  if (!quota.ok) return NextResponse.json({ ok: false, error: quota.message }, { status: 429 });

  const { facts: f, direction: d, instruction } = parsed.data;
  const factText = [
    `Business: ${f.name}`,
    `What it offers: ${f.offering}`,
    f.customer && `Who it's for: ${f.customer}`,
    f.location && `Where: ${f.location}`,
    f.offer && `Current offer: ${f.offer}`,
    f.proof && `Something true that builds trust: ${f.proof}`,
    f.problem && `The problem it solves: ${f.problem}`,
  ]
    .filter(Boolean)
    .join("\n");
  const r = await rewriteWords({ current: { hook: d.hook, body: d.body, cta: toButton(d.cta) }, instruction, title: d.label, factText, brain: "", avoid: [] });
  return NextResponse.json(r, { status: r.ok ? 200 : 422 });
}
