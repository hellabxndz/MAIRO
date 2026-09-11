import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { maybeGoLive } from "@/lib/campaigns/auto-launch";

// The thing that makes a scheduled start actually happen.
//
// Auto-launch also runs when somebody opens the dashboard, and for an account
// with no booked time that is enough: they finish their setup, the page loads,
// the campaign goes live. But a customer who books a launch for Friday at 6am
// is explicitly not going to be sitting at their laptop at 6am — that is the
// entire reason they scheduled it. Without this route the campaign would sit
// paused until their next visit, which could be days.
//
// Vercel calls it on the schedule in vercel.json. Anything else has to present
// CRON_SECRET.

export const dynamic = "force-dynamic";
// Several organizations, each doing a Graph call or two. The default budget is
// not enough on a busy hour.
export const maxDuration = 60;

/**
 * Whether this request is allowed to launch campaigns.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` on its own invocations.
 * Without a secret configured the route refuses everything rather than running
 * openly — an unauthenticated endpoint that puts ads live is not a thing to
 * leave lying around, and failing closed makes a missing variable obvious on
 * the first run instead of silently inviting the internet to spend money.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Not authorized", { status: 401 });
  }

  // Only organizations with something actually waiting. maybeGoLive is cheap
  // when there is nothing to do, but it is not free — it reads billing from
  // Meta — and running it for every account on the platform every hour would
  // be a lot of Graph calls to answer "no".
  const waiting = await db.platformCampaign.findMany({
    where: {
      status: "PENDING_REVIEW",
      externalCampaignId: { not: null },
      externalAdId: { not: null },
    },
    select: { mairoCampaign: { select: { organizationId: true } } },
  });

  const organizationIds = [...new Set(waiting.map((c) => c.mairoCampaign.organizationId))];

  let launched = 0;
  const errors: string[] = [];

  // Sequential on purpose. These are writes that spend money, and a burst of
  // parallel Graph calls is also the fastest way to get rate-limited by Meta
  // and have half of them fail for no reason.
  for (const organizationId of organizationIds) {
    try {
      const outcome = await maybeGoLive(organizationId);
      if (outcome.launched) launched += outcome.names.length;
    } catch (error) {
      // One account's problem must not stop the rest of the run. Recorded and
      // carried on; the next hour tries again.
      errors.push(`${organizationId}: ${error instanceof Error ? error.message : "failed"}`);
    }
  }

  return NextResponse.json({
    checked: organizationIds.length,
    launched,
    errors: errors.length > 0 ? errors : undefined,
  });
}
