import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { deniedFor } from "@/lib/members/authorize";
import { anonKeyFor, takeSaveQuota } from "@/lib/website/store";
import { savedPlanSchema } from "@/lib/preview/saved-plan";
import { savePlan } from "@/lib/preview/saved-plan-store";
import { claimPendingPlan, rememberPendingPlan } from "@/lib/preview/pending-plan";

// Save, Share and Put MAIRO to Work on the free AI ad plan. Stores the plan
// only because the visitor pressed one of them, and answers with its private
// link. Signed in (with a role that may change the business's plan), it's
// saved into the business at once and setup opens with its answers; signed
// out, it belongs to no one until it's claimed: this browser remembers it
// (lib/preview/pending-plan.ts) and the account created or signed in to next
// takes it.
//
// POST { plan }          → { token, next }   save a new plan; `next` is where Put MAIRO to Work goes
// POST { claim: true }   → { claimed, next }   signed in now: take the plan this browser saved before (/onboarding/claim)

const MAX_BYTES = 60_000;

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > MAX_BYTES) return NextResponse.json({ ok: false, error: "That plan is too large to save." }, { status: 413 });
  let body: { plan?: unknown; claim?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  const session = await auth();
  const signedIn = Boolean(session?.user?.id);

  if (body.claim === true) {
    if (!signedIn) return NextResponse.json({ ok: false, error: "Sign in to keep this plan in your account." }, { status: 401 });
    const denied = await deniedFor("business.edit");
    if (denied) return NextResponse.json({ ok: false, error: denied }, { status: 403 });
    const org = await activeOrganizationId();
    if (!org) return NextResponse.json({ ok: false, error: "No business to save it to." }, { status: 400 });
    const claimed = await claimPendingPlan(org);
    const intake = await db.onboardingIntake.findUnique({ where: { organizationId: org }, select: { id: true } });
    return NextResponse.json({ ok: true, claimed, next: intake ? "/dashboard" : "/onboarding" });
  }

  const parsed = savedPlanSchema.safeParse(body.plan);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "That plan couldn't be saved — build it again and try once more." }, { status: 400 });
  const anonKey = anonKeyFor(request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, request.headers.get("user-agent"));
  const quota = await takeSaveQuota(anonKey);
  if (!quota.ok) return NextResponse.json({ ok: false, error: quota.message }, { status: 429 });

  let organizationId: string | null = null;
  if (signedIn && !(await deniedFor("business.edit"))) organizationId = await activeOrganizationId();
  const saved = await savePlan(parsed.data, organizationId);
  if (!organizationId) await rememberPendingPlan(saved.shareToken);
  // Where Put MAIRO to Work goes next: sign-up (the plan follows), or setup — already filled in — for a business that hasn't finished it.
  const intake = organizationId ? await db.onboardingIntake.findUnique({ where: { organizationId }, select: { id: true } }) : null;
  const next = !signedIn ? "/sign-up?from=plan" : organizationId && !intake ? "/onboarding" : "/dashboard";
  return NextResponse.json({ ok: true, token: saved.shareToken, savedToAccount: Boolean(organizationId), next });
}
