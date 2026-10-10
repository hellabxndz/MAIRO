import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { loadJourney, type JourneyStep } from "@/lib/strategy/journey";
import { GOAL_LABEL, agesText, campaignTypeInfo, platformsText, usd } from "@/lib/strategy/plan-logic";
import { buildFromPlanAction } from "@/lib/actions/strategy-actions";
import { CancelLaunch, LaunchPanel } from "@/components/strategy/launch-panel";
import { SetupProgress } from "@/components/onboarding/setup-progress";
import { SetupTeam } from "@/components/onboarding/setup-team";
import { PreLaunchReview } from "@/components/onboarding/prelaunch-review";
import { ProblemCard } from "@/components/onboarding/problem-card";
import { PendingButton } from "@/components/onboarding/pending-button";
import { loadOnboarding } from "@/lib/onboarding/progress-store";
import { focusStep } from "@/lib/onboarding/progress";
import { setupWork } from "@/lib/onboarding/team";
import { loadPreLaunch } from "@/lib/onboarding/prelaunch";
import { connectHref, connectProblemFromParams } from "@/lib/onboarding/problems";

// LET'S TURN YOUR PLAN INTO A REAL CAMPAIGN.
//
// The paid stage of the one journey (steps 9 and 10 of ten): the strategy is
// done, so this only asks for what MAIRO can't do alone — the Meta
// connection, the final creatives — then shows the pre-launch review
// (goal, audience, ads, account, Meta's bill and MAIRO's, tracking, the
// approvals still needed) and waits for "Approve and launch". Nothing goes
// live before that press, and "live" is said only once Meta confirms it.

export const metadata = { title: "Your first campaign" };
export const dynamic = "force-dynamic";

const card = "rounded-2xl border border-white/[0.07] bg-field/80";

export default async function LaunchPage({ searchParams }: { searchParams: Promise<{ welcome?: string; subscribed?: string; connected?: string; metaError?: string; missing?: string; metaDetail?: string; acct?: string }> }) {
  const params = await searchParams;
  const { welcome, subscribed } = params;
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const row = await db.strategyPlan.findUnique({ where: { organizationId }, select: { status: true, activatedAt: true } });
  if (!row) redirect("/dashboard");
  if (row.status !== "APPROVED" && !row.activatedAt) redirect("/plan");

  const journey = await loadJourney(organizationId, { checkFunding: true });
  if (!journey) redirect("/plan");
  const [steps, work, org] = await Promise.all([
    loadOnboarding(organizationId),
    setupWork(organizationId),
    db.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } }),
  ]);
  const focus = steps ? focusStep(steps) : null;
  const stepOf = (id: string) => steps?.find((s) => s.id === id) ?? null;
  const tz = org?.timezone ?? undefined;

  // Back from Stripe before its confirmation reached MAIRO: say so and look again.
  if (!journey.activated) {
    if (subscribed !== "1") redirect("/plan/activate");
    return (
      <div className={`${card} mx-auto mt-10 max-w-[560px] p-8 text-center`}>
        <meta httpEquiv="refresh" content="4" />
        <p className="text-[18px] font-semibold text-white">Confirming your subscription with Stripe…</p>
        <p className="mt-2 text-[14px] text-muted">This usually takes a few seconds. The page checks again on its own.</p>
      </div>
    );
  }

  const { plan } = journey;

  if (journey.next === "live") {
    return (
      <div className="mx-auto max-w-[900px]">
        {steps && <SetupProgress steps={steps} />}
        <div className={`${card} mt-6 p-6 sm:p-8`}>
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
            <span aria-hidden className="h-2 w-2 rounded-full bg-emerald-400" /> Live
          </span>
          <h1 className="mt-3 text-[clamp(24px,3vw,32px)] font-semibold tracking-[-0.02em] text-white">Welcome to your full MAIRO dashboard.</h1>
          <p className="mt-2 text-[15px] text-muted">Meta confirmed your first campaign is live. MAIRO is now monitoring performance.</p>
          <p className="mt-1 text-[13px] text-faint">The first numbers usually arrive from Meta within a few hours; until then your dashboard says it&rsquo;s collecting data rather than showing anything made up.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/dashboard" className="inline-flex min-h-[46px] items-center rounded-lg bg-[#7c5cff] px-6 text-[14.5px] font-medium text-white hover:brightness-110">Open my dashboard</Link>
            {journey.campaign && (
              <Link href={`/dashboard/campaigns/${journey.campaign.id}`} className="inline-flex min-h-[46px] items-center rounded-lg border border-white/12 px-5 text-[14px] text-white/85 hover:border-white/30">View campaign</Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  const prefilled: [string, string][] = [
    ["Goal", GOAL_LABEL[plan.goal]],
    ["Platform", platformsText(plan.platforms)],
    ["Daily budget", `${usd(plan.dailyBudget)}/day`],
    ["Split", plan.split.map((s) => `${s.label} ${s.percent}%`).join(" · ")],
    ["Audience", plan.audience.summary || "—"],
    ["Location", plan.audience.location || "To confirm"],
    ["Age", agesText(plan.audience)],
    ["Interests", plan.audience.interests.join(", ") || "—"],
    ["Product", plan.product || "—"],
    ["Offer", plan.offer || "None"],
    ["Creative strategy", plan.creativeStrategy],
    ["Hooks", plan.hooks.map((h) => `“${h}”`).join("  ")],
    ["Retargeting plan", plan.retargeting],
    ["Campaign type", campaignTypeInfo(plan.campaignType).label],
  ];

  const review = journey.built && journey.campaign ? await loadPreLaunch(organizationId, journey) : null;
  const campaignHref = journey.campaign ? `/dashboard/campaigns/${journey.campaign.id}` : "/dashboard/launch";
  // Back from Facebook with a problem, or a connection that's stopped working since.
  const returnedProblem = connectProblemFromParams(params, "/dashboard/launch");
  const connectProblem = returnedProblem ?? stepOf("connect")?.problem ?? null;
  const buildProblem = stepOf("prepare")?.problem ?? null;
  const launchProblem = stepOf("launch")?.problem ?? null;
  const reviewing = journey.next === "review" || journey.next === "waiting";

  return (
    <div className="mx-auto max-w-[1100px]">
      {steps && <SetupProgress steps={steps} here={reviewing ? "launch" : "prepare"} showProblem={false} />}

      {(welcome === "1" || subscribed === "1") && (
        <div className="mt-6 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.05] p-6">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-emerald-300">Welcome to full MAIRO</p>
          <p className="mt-1 text-[19px] font-semibold text-white">Your plan is active.</p>
          <p className="mt-1 text-[14px] text-muted">Your approved strategy is ready to become a real campaign. Everything is prefilled from your plan — nothing to answer again.</p>
        </div>
      )}

      <div className="mt-6">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">{reviewing ? "Step 10 of 10" : "Step 9 of 10"}</p>
        <h1 className="mt-1 text-[clamp(24px,3vw,32px)] font-semibold tracking-[-0.02em] text-white">
          {journey.next === "waiting" ? "You approved the launch." : reviewing ? "Review your campaign before it goes live." : "Let\u2019s turn your plan into a real campaign."}
        </h1>
        <p className="mt-1.5 text-[14.5px] text-muted">
          {journey.next === "waiting"
            ? "Nothing is live yet. It starts once Meta approves the ad and confirms it can charge your ad account."
            : reviewing
              ? "Nothing is live yet. Check each part — change anything you like — then approve it below."
              : "MAIRO builds it in your Meta ad account, switched off, from the plan you approved. You review everything before anything is spent."}
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {journey.next !== "connect" && connectProblem && <ProblemCard problem={connectProblem} tone={returnedProblem ? "alert" : "warn"} />}

          {journey.next === "connect" && (
            connectProblem ? (
              <ProblemCard problem={connectProblem} tone="warn" />
            ) : (
              <div className={`${card} p-6`}>
                <p className="text-[17px] font-semibold text-white">Connect Facebook & Instagram</p>
                <p className="mt-1 text-[13.5px] text-muted">MAIRO builds your campaign inside your own Meta ad account. Your login stays with Meta — MAIRO never sees your password. Connecting doesn&rsquo;t build or spend anything.</p>
                <a href={connectHref("/dashboard/launch")} className="mt-4 inline-flex min-h-[46px] items-center rounded-lg bg-[#7c5cff] px-6 text-[14.5px] font-medium text-white hover:brightness-110">
                  Connect Facebook & Instagram
                </a>
              </div>
            )
          )}

          {journey.next === "build" && (
            <>
              {buildProblem && <ProblemCard problem={buildProblem} />}
              <div className={`${card} p-6`}>
                <p className="text-[17px] font-semibold text-white">{journey.draftId ? "Finish building your campaign" : "Build my campaign"}</p>
                <p className="mt-1 text-[13.5px] text-muted">
                  MAIRO opens the campaign builder with your approved plan already filled in. You confirm the location, make the final ads from your plan&rsquo;s ideas and check the budget. It&rsquo;s built in your ad account switched off — then you see the full review here, and nothing spends until you approve it.
                </p>
                <form action={buildFromPlanAction} className="mt-4">
                  <PendingButton pendingText="Opening the builder…" className="min-h-[46px] rounded-lg bg-[#7c5cff] px-6 text-[14.5px] font-medium text-white hover:brightness-110">
                    {journey.draftId ? "Continue building" : buildProblem ? "Try building again" : "Build my campaign"}
                  </PendingButton>
                </form>
              </div>
            </>
          )}

          {reviewing && review && (
            <>
              {journey.next === "waiting" && (
                launchProblem ? (
                  <ProblemCard problem={launchProblem} />
                ) : (
                  <div className="rounded-2xl border border-violet/30 bg-violet/[0.06] p-5" data-launch-state="waiting">
                    <p className="text-[15px] font-semibold text-white">Waiting for Meta</p>
                    <p className="mt-1 text-[13.5px] text-white/85">
                      {journey.campaign?.reviewState ? `Meta's review: ${journey.campaign.reviewState.toLowerCase().replace(/_/g, " ")}. ` : ""}
                      MAIRO switches it on as soon as Meta clears the ad and confirms your payment method — you don&rsquo;t need to come back. It&rsquo;s only called live once Meta confirms it.
                    </p>
                    <div className="mt-3"><CancelLaunch /></div>
                  </div>
                )
              )}
              <PreLaunchReview review={review} campaignHref={campaignHref} />
              {journey.next === "review" && (
                <LaunchPanel
                  name={review.campaign.name}
                  budget={review.budget.headline}
                  per30={review.budget.per30}
                  adAccount={review.account.adAccount}
                  subscription={`${review.subscription.price} · ${review.subscription.status}`}
                  ready={review.ready}
                  campaignHref={campaignHref}
                />
              )}
              {journey.comparison && (
                <details className={`${card} p-5`}>
                  <summary className="cursor-pointer text-[14px] font-medium text-white">Compare with your approved plan, line by line</summary>
                  <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.07]">
                    <ul>
                      {journey.comparison.map((r) => (
                        <li key={r.key} className={`border-t border-white/[0.05] px-4 py-3 first:border-t-0 ${r.status === "different" ? "bg-amber-400/[0.05]" : ""}`}>
                          <div className="grid grid-cols-1 gap-1 sm:grid-cols-[140px_1fr_1fr] sm:gap-3">
                            <span className="text-[13px] font-medium text-white">{r.label}</span>
                            <span className="text-[13px] text-white/80"><span className="text-faint">Plan: </span>{r.approved}</span>
                            <span className="text-[13px] text-white"><span className="text-faint">Campaign: </span>{r.real}</span>
                          </div>
                          {r.note && <p className={`mt-1.5 text-[12.5px] ${r.status === "different" ? "text-amber-200" : "text-muted"}`}>{r.note}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                </details>
              )}
            </>
          )}

          <details className={`${card} p-5`}>
            <summary className="cursor-pointer text-[14px] font-medium text-white">Carried over from your approved plan</summary>
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
              {prefilled.map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-[11.5px] uppercase tracking-[0.14em] text-faint">{k}</dt>
                  <dd className="text-[13px] leading-relaxed text-white/90">{v}</dd>
                </div>
              ))}
            </dl>
            <Link href="/plan" className="mt-3 inline-block text-[12.5px] text-violet-bright hover:text-white">View the full approved plan</Link>
          </details>
        </div>

        <aside className="min-w-0 space-y-4">
          <SetupTeam work={work} focus={focus?.id ?? null} timeZone={tz} />
          <div className={`${card} p-5`}>
            <p className="text-[15px] font-semibold text-white">Checklist</p>
            <ol className="mt-3 space-y-2.5">
              {journey.steps.map((s) => (
                <Step key={s.id} s={s} />
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Step({ s }: { s: JourneyStep }) {
  const mark = s.state === "done" ? "✓" : s.state === "unknown" ? "?" : "○";
  const tone = s.state === "done" ? "text-emerald-300" : s.state === "current" ? "text-violet-bright" : s.state === "unknown" ? "text-amber-300" : "text-faint";
  const body = (
    <>
      <span aria-hidden className={`w-4 shrink-0 text-center ${tone}`}>{mark}</span>
      <span className="min-w-0">
        <span className={`block text-[13.5px] ${s.state === "todo" ? "text-white/60" : "text-white"}`}>{s.label}</span>
        {s.detail && <span className="block text-[12px] text-faint">{s.detail}</span>}
      </span>
    </>
  );
  return (
    <li>
      {s.href && s.state !== "done" ? (
        <a href={s.href} className="flex gap-2.5 rounded-lg hover:bg-white/[0.03]">{body}</a>
      ) : (
        <div className="flex gap-2.5">{body}</div>
      )}
    </li>
  );
}
