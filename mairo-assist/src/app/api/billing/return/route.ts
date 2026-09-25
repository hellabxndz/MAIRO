import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { confirmCheckout } from "@/lib/billing/service";
import { safeNextPath } from "@/lib/security/redirect";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

/**
 * Stripe sends the customer here after Checkout. The redirect itself proves
 * nothing: the session is looked up with Stripe and the plan is activated only
 * if Stripe says it's paid. The webhook does the same, whichever comes first.
 */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id") ?? "";
  const next = safeNextPath(request.nextUrl.searchParams.get("next"), "/dashboard/upgrade");
  const to = (checkout: string) => NextResponse.redirect(new URL(`${next}${next.includes("?") ? "&" : "?"}checkout=${checkout}`, request.nextUrl.origin));

  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`, request.nextUrl.origin));
  if (!/^cs_[A-Za-z0-9_]{6,200}$/.test(sessionId)) return to("failed");

  const { data: checkout } = await createAdminClient().from("billing_checkouts").select("business_id").eq("provider_session_id", sessionId).maybeSingle();
  if (!checkout) return to("failed");
  // Only a member of the business that started the checkout can confirm it.
  const { data: member } = await (await createClient()).from("business_members").select("user_id").eq("business_id", checkout.business_id).eq("user_id", user.id).maybeSingle();
  if (!member) return to("failed");

  const outcome = await confirmCheckout(sessionId, checkout.business_id);
  return to(outcome === "activated" ? "success" : outcome === "pending" ? "pending" : "failed");
}
