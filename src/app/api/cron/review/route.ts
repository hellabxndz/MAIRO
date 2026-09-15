import { NextResponse } from "next/server";
import { retryStuckReviews } from "@/lib/creatives/review-run";
import { syncAllMetaLeads } from "@/lib/leads/meta-form";

// The backstop for a safety check that couldn't run.
//
// Every creative is approved or blocked by the automated reviewer the moment
// its concept is written — see generateConcept in creative-actions.ts. Nobody
// signs off by hand, and nothing is meant to sit in a queue.
//
// The one case that breaks is the reviewer being unreachable: no API key, a
// timeout, a bad response. When that happens the request stops at IN_REVIEW
// rather than being approved unchecked. That is the right call, but on its own
// it means one bad minute parks an ad forever. This sweeps those up and asks
// again.
//
// Two other things do the same work sooner: the customer's own creatives page
// retries their account's stuck requests after it renders, and the owner has a
// button on /aios/creatives. This is for the request nobody happens to look at.
//
// The schedule in vercel.json is DAILY and must stay daily — Vercel's Hobby
// plan refuses the whole deployment if any cron runs more often, which is what
// silently broke every build for days once already.

export const dynamic = "force-dynamic";
// A handful of model calls, one after another.
export const maxDuration = 60;

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

  // Deliberately smaller than the library default. Each one is a model call
  // made in sequence, and the run has to finish inside maxDuration — a backlog
  // that takes three nights to clear is better than a run that times out every
  // night and clears nothing.
  const reviews = await retryStuckReviews({ limit: 8 });

  // Pulled on the same schedule rather than its own, because Hobby allows two
  // crons in total and both of these are "go and fetch what the networks did
  // not tell us about". A native instant form holds its leads on Meta until
  // somebody asks, and nobody would.
  const leads = await syncAllMetaLeads();

  return NextResponse.json({ reviews, leads });
}
