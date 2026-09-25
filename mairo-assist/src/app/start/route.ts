import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { isPlanKey } from "@/lib/billing/plans";
import { createClient } from "@/lib/supabase/server";

/**
 * Where "Start Free" and the pricing buttons lead:
 * - signed out → create an account (the chosen plan is carried along)
 * - signed in without a business → choose a plan, then business setup
 * - signed in with a business → the dashboard (or the upgrade page for a paid plan)
 * Nothing is created here, so repeated clicks can't duplicate anything.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("plan");
  const plan = isPlanKey(raw) && raw !== "enterprise" ? raw : "free";
  const go = (path: string) => NextResponse.redirect(new URL(path, request.nextUrl.origin));

  const user = await getSessionUser();
  if (!user) return go(`/signup?plan=${plan}`);

  const { count } = await (await createClient()).from("business_members").select("business_id", { count: "exact", head: true }).eq("user_id", user.id);
  if (!count) return go(`/onboarding/plan?plan=${plan}`);
  return go(plan === "free" ? "/dashboard" : `/dashboard/upgrade?plan=${plan}`);
}
