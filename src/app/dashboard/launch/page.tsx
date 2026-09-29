import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { loadJourney, type JourneyStep } from "@/lib/strategy/journey";
import { GOAL_LABEL, agesText, campaignTypeInfo, platformsText, usd } from "@/lib/strategy/plan-logic";
import { buildFromPlanAction } from "@/lib/actions/strategy-actions";
import { LaunchPanel } from "@/components/strategy/launch-panel";
import { JourneySteps } from "@/components/strategy/journey";

// LET'S TURN YOUR PLAN INTO A REAL CAMPAIGN.
//
// The paid stage of the one journey: the strategy is done, so this only asks
// for what MAIRO can't do alone — the Meta connection, the payment method, the
// final creatives — then shows the approved plan beside the real campaign and
// waits for Launch Campaign. Nothing goes live before that press.

export const metadata = { title: "Your first campaign" };
export const dynamic = "force-dynamic";

const card = "rounded-2xl border border-white/[0.07] bg-[#0b1122]/80";

export default async function LaunchPage({ searchParams }: { searchParams: Promise<{ welcome?: string; subscribed?: string; connected?: string }> }) {
  const { welcome, subscribed } = await searchParams;
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const row = await db.strategyPlan.findUnique({ where: { organizationId }, select: { status: true, activatedAt: true } });
  if (!row) redirect("/dashboard");
  if (row.status !== "APPROVED" && !row.activatedAt) redirect("/plan");

  const journey = await loadJourney(organizationId, { checkFunding: true });
  if (!journey) redirect("/plan");

  // Back from Stripe before its confirmation reached Mairo: say so and look again.
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
  const stage = journey.next === "live" ? "Launch" : journey.next === "review" || journey.next === "waiting" ? "Launch" : "Build campaign";

  if (journey.next === "live") {
    return (
      <div className="mx-auto max-w-[900px]">
        <JourneySteps current="Launch" />
        <div className={`${card} mt-6 p-6 sm:p-8`}>
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
            <span aria-hidden className="h-2 w-2 rounded-full bg-emerald-400" /> Live
          </span>
          <h1 className="mt-3 text-[clamp(24px,3vw,32px)] font-semibold tracking-[-0.02em] text-white">Welcome to your full Mairo dashboard.</h1>
          <p className="mt-2 text-[15px] text-muted">Your first campaign is live. Mairo is now monitoring performance.</p>
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

  return (
    <div className="mx-auto max-w-[1100px]">
      <JourneySteps current={stage} />

      {(welcome === "1" || subscribed === "1") && (
        <div className="mt-6 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.05] p-5">
          <p className="text-[17px] font-semibold text-white">Welcome to Mairo. Your full advertising platform is now unlocked.</p>
          <p className="mt-1 text-[13.5px] text-muted">Everything below starts from the plan you approved — nothing to fill in again.</p>
        </div>
      )}

      <div className="mt-6">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">Let&rsquo;s turn your plan into a real campaign</p>
        <h1 className="mt-1 text-[clamp(24px,3vw,32px)] font-semibold tracking-[-0.02em] text-white">Your strategy is already complete.</h1>
        <p className="mt-1.5 text-[14.5px] text-muted">Now Mairo needs a few things before it can build it.</p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          {/* The next thing to do */}
          {journey.next === "connect" && (
            <div className={`${card} p-6`}>
              <p className="text-[17px] font-semibold text-white">Connect Facebook & Instagram</p>
              <p className="mt-1 text-[13.5px] text-muted">Mairo builds your campaign inside your own Meta ad account. Your login stays with Meta — Mairo never sees your password.</p>
              <a href="/api/meta/connect?returnTo=%2Fdashboard%2Flaunch" className="mt-4 inline-flex min-h-[46px] items-center rounded-lg bg-[#7c5cff] px-6 text-[14.5px] font-medium text-white hover:brightness-110">
                Connect Facebook & Instagram
              </a>
            </div>
          )}

          {journey.next === "build" && (
            <div className={`${card} p-6`}>
              <p className="text-[17px] font-semibold text-white">{journey.draftId ? "Finish building your campaign" : "Turn My Plan Into a Campaign"}</p>
              <p className="mt-1 text-[13.5px] text-muted">
                Mairo opens the campaign builder with your approved plan already filled in. You confirm the location, make the final creatives from your hooks, check the budget, and Mairo runs its pre-launch check. It&rsquo;s built in your ad account switched off — nothing spends until you press Launch.
              </p>
              <form action={buildFromPlanAction} className="mt-4">
                <button type="submit" className="min-h-[46px] rounded-lg bg-[#7c5cff] px-6 text-[14.5px] font-medium text-white hover:brightness-110">
                  {journey.draftId ? "Continue building" : "Turn My Plan Into a Campaign"}
                </button>
              </form>
            </div>
          )}

          {(journey.next === "review" || journey.next === "waiting") && journey.comparison && journey.campaign && (
            <div className={`${card} p-6`}>
              <p className="text-[17px] font-semibold text-white">Your campaign is ready.</p>
              <p className="mt-1 text-[13.5px] text-muted">Mairo created everything based on the plan you approved. Check it against your plan before it goes live.</p>
              {journey.campaign.lastError && (
                <p className="mt-3 rounded-lg bg-alert/10 px-3 py-2 text-[13px] text-alert">Meta said: {journey.campaign.lastError}</p>
              )}

              <div className="mt-5 overflow-hidden rounded-xl border border-white/[0.07]">
                <div className="hidden grid-cols-[140px_1fr_1fr] gap-3 bg-white/[0.03] px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-faint sm:grid">
                  <span />
                  <span>Approved plan</span>
                  <span>Real campaign</span>
                </div>
                <ul>
                  {journey.comparison.map((r) => (
                    <li key={r.key} className={`border-t border-white/[0.05] px-4 py-3 ${r.status === "different" ? "bg-amber-400/[0.05]" : ""}`}>
                      <div className="grid grid-cols-1 gap-1 sm:grid-cols-[140px_1fr_1fr] sm:gap-3">
                        <span className="flex items-center gap-2 text-[13px] font-medium text-white">
                          <span aria-hidden className={r.status === "same" ? "text-emerald-300" : r.status === "different" ? "text-amber-300" : "text-violet-bright"}>
                            {r.status === "same" ? "✓" : r.status === "different" ? "≠" : "i"}
                          </span>
                          {r.label}
                        </span>
                        <span className="text-[13px] text-white/80"><span className="text-faint sm:hidden">Plan: </span>{r.approved}</span>
                        <span className="text-[13px] text-white"><span className="text-faint sm:hidden">Campaign: </span>{r.real}</span>
                      </div>
                      {r.note && <p className={`mt-1.5 text-[12.5px] sm:pl-[152px] ${r.status === "different" ? "text-amber-200" : "text-muted"}`}>{r.note}</p>}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6">
                {journey.next === "waiting" ? (
                  <p className="rounded-xl border border-violet/30 bg-violet/[0.06] px-4 py-3 text-[13.5px] text-white/90">
                    You approved the launch. {journey.campaign.reviewState ? `Meta's review: ${journey.campaign.reviewState.toLowerCase().replace(/_/g, " ")}. ` : ""}
                    Mairo switches it on as soon as Meta clears the ad — you don&rsquo;t need to come back.
                  </p>
                ) : (
                  <LaunchPanel
                    dailyBudget={journey.comparison.find((r) => r.key === "budget")?.real.replace("/day", "") ?? usd(plan.dailyBudget)}
                    campaignHref={`/dashboard/campaigns/${journey.campaign.id}`}
                  />
                )}
              </div>
            </div>
          )}

          <div className={`${card} p-5`}>
            <p className="text-[15px] font-semibold text-white">Carried over from your approved plan</p>
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
              {prefilled.map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-[11.5px] uppercase tracking-[0.14em] text-faint">{k}</dt>
                  <dd className="text-[13px] leading-relaxed text-white/90">{v}</dd>
                </div>
              ))}
            </dl>
            <Link href="/plan" className="mt-3 inline-block text-[12.5px] text-violet-bright hover:text-white">View the full approved plan</Link>
          </div>
        </div>

        <aside className="min-w-0">
          <div className={`${card} p-5 lg:sticky lg:top-6`}>
            <p className="text-[15px] font-semibold text-white">Progress</p>
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
