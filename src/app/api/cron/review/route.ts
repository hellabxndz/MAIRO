import { NextResponse } from "next/server";
import { retryStuckReviews } from "@/lib/creatives/review-run";
import { syncAllMetaLeads } from "@/lib/leads/meta-form";
import { sweepSmsNotifications } from "@/lib/sms/sweep";
import { detectAll } from "@/lib/notifications/detect";
import { announceMonthlyReports } from "@/lib/reports/monthly";
import { refreshAllDecisions } from "@/lib/decisions/run";
import { sweepStuckRuns } from "@/lib/team/runs";
import { generateDueWeeklyReports } from "@/lib/reports/weekly";
import { stopUnpaidSweep } from "@/lib/billing/stop-unpaid";
import { pauseSocialSweep } from "@/lib/social/pause";
import { runAllPlatformIntelligence } from "@/lib/platform-intelligence/registry";

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

  // MAIRO going and looking, which is the whole difference between a
  // dashboard and an employee. Runs before the text sweep because a
  // notification written here is what that sweep may end up texting about.
  const insights = await detectAll();

  // On the same schedule for the same reason: Hobby allows two crons, and the
  // two updates that nobody else can trigger — "something needs attention" and
  // the weekly summary — need somebody to go and look. It costs nothing for an
  // account that has not asked to be texted.
  // Only does anything in the first few days of a month, and only for
  // businesses whose month had advertising in it.
  const reports = await announceMonthlyReports();

  // Mairo Decisions' daily look, oldest-checked accounts first. Kept small so
  // the run fits in maxDuration; anyone not reached today is refreshed when
  // they next open the dashboard.
  const decisions = await refreshAllDecisions(10).catch((error) => {
    console.error("Mairo Decisions cron failed:", error);
    return null;
  });

  // Weekly Reports for businesses whose delivery day it is. After Decisions,
  // so each report reads this morning's Insights; before the text sweep,
  // because the report's own notification is what carries its text.
  const weekly = await generateDueWeeklyReports(new Date(), { limit: 3, budgetMs: 25_000 }).catch((error) => {
    console.error("Weekly reports cron failed:", error);
    return null;
  });

  const texts = await sweepSmsNotifications();

  // AI Team runs that never finished (a timeout, a crash) are marked failed,
  // so no agent shows "Working" on something that stopped.
  const stuckRuns = await sweepStuckRuns().catch((error) => {
    console.error("AI Team stuck-run sweep failed:", error);
    return null;
  });

  // Backstop for a missed Stripe webhook: never-paid subscriptions that ended
  // or failed still have nothing running.
  const unpaid = await stopUnpaidSweep().catch((error) => {
    console.error("Unpaid sweep failed:", error);
    return null;
  });

  // Social Manager is Scale-only: anything scheduled by an account whose
  // Scale lapsed is paused, never published.
  const socialPaused = await pauseSocialSweep().catch((error) => {
    console.error("Social pause sweep failed:", error);
    return null;
  });

  // Meta Intelligence: check Meta's official sources for changes, analyse
  // what's new, and watch API versions, error spikes and deprecations. Last,
  // with a small budget: it never touches a customer's campaign, so a slow
  // night here costs nothing but a day's delay.
  const platformIntelligence = await runAllPlatformIntelligence(12_000).catch((error) => {
    console.error("Platform intelligence cron failed:", error);
    return null;
  });

  return NextResponse.json({ reviews, leads, insights, reports, texts, decisions, weekly, unpaid, socialPaused, platformIntelligence, stuckRuns });
}
