import Link from "next/link";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { pulseDue } from "@/lib/success/store";
import { PULSE_LATER_COOKIE } from "@/lib/success/journey";
import { loadConsole } from "@/lib/dashboard/console";
import type { RangeDays } from "@/lib/dashboard/overview";
import { loadPixelSetup, pixelStateFor } from "@/lib/tracking/pixel-setup";
import { assistantNameOf } from "@/lib/ai/agents";
import { Pill } from "@/components/console/kit";
import { DecisionControls } from "@/components/console/decision-controls";
import { HomeComposer } from "@/components/dashboard/home/composer";
import { PulseCard } from "@/components/success/feedback";
import { ResultsNote } from "@/components/results-disclaimer";
import { MairoCore } from "@/components/cinematic/core";
import { CountUp } from "@/components/cinematic/count-up";
import { loadManagerStatus } from "@/lib/dashboard/manager";
import { AutopilotToggle } from "@/components/dashboard/home/autopilot-toggle";
import { loadJourney } from "@/lib/strategy/journey";
import { launchGate } from "@/lib/tracking/pixel-rules";
import { rightNow } from "@/lib/dashboard/right-now";

// The Overview, as simple as a chat app's home: who you are, one box to say
// what you want, the one thing to do next, a short summary of how the ads are
// doing, anything waiting for a yes, and the campaigns running.
//
// Every figure and sentence here comes from loadConsole: this business's own
// records and what Meta reported for its campaigns. Nothing is estimated and
// nothing is written by a model; a figure that wasn't reported isn't shown.
// Everything that used to crowd this screen (the AI team, the Daily Brief,
// the activity feed, every metric) is still a tap away, in Results, the
// approvals, and Account → More.

// What's missing for purchase tracking, said about the business rather than
// "this campaign" — the Overview may be read before any campaign exists.
const PURCHASE_GAP: Record<string, string> = {
  no_pixel: "No Meta Pixel is set up for your website yet.",
  declined: "You chose not to connect a Meta Pixel.",
  access_lost: "MAIRO can't reach your Meta Pixel right now.",
  not_receiving: "Your Pixel isn't sending website events to Meta yet.",
  deferred: "You chose to set up tracking later.",
  purchase_not_chosen: "Completed purchases aren't among what you chose to measure.",
  no_purchase_seen: "Meta hasn't seen a purchase from your website yet.",
  purchase_no_value: "Your purchases reach Meta without an order value and currency.",
};

const btn = "inline-flex min-h-12 w-full items-center justify-center rounded-full bg-white px-6 text-[15px] font-semibold text-black transition hover:bg-white/90 sm:w-auto";

function Section({ title, action, children }: { title: string; action?: { href: string; label: string }; children: ReactNode }) {
  return (
    <section className="mt-9">
      <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
        <h2 className="text-[15px] font-semibold text-white">{title}</h2>
        {action && (
          <Link href={action.href} className="text-[13px] text-muted hover:text-white">
            {action.label} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export async function HomeOverview({
  organizationId,
  userName,
  days,
  above,
  askFeedback = false,
}: {
  organizationId: string;
  userName: string;
  days: RangeDays;
  above?: ReactNode;
  askFeedback?: boolean;
}) {
  const [c, org, setup, pulseWanted, pulseLater, manager] = await Promise.all([
    loadConsole(organizationId, userName, days),
    db.organization.findUnique({ where: { id: organizationId }, select: { assistantName: true } }),
    loadPixelSetup(organizationId).catch(() => null),
    pulseDue(organizationId).catch(() => false),
    cookies().then((k) => k.get(PULSE_LATER_COOKIE)?.value === "1"),
    loadManagerStatus(organizationId).catch(() => null),
  ]);
  const showPulse = askFeedback || (pulseWanted && !pulseLater);
  const name = assistantNameOf(org?.assistantName);
  const o = c.overview;
  const noCampaigns = o.campaigns.length === 0;

  // The first campaign's exact step, while it isn't launched — so the top of
  // the page can say "connect Meta" or "approve it" rather than "continue".
  const firstSetup = c.actions.items.find((i) => i.key === "first");
  const journey = firstSetup ? await loadJourney(organizationId, { checkFunding: false }).catch(() => null) : null;
  // A shop's result is purchases: verified only once Meta has received a
  // Purchase event (with its value, where Meta says) — the launch gate's rule.
  const sellsOnline = setup?.need === "required_for_purchases";
  const purchaseGate = sellsOnline ? launchGate("required_for_purchases", await pixelStateFor(organizationId)) : null;
  const purchaseVerified = Boolean(purchaseGate?.ok);
  const trackingNeeded = sellsOnline && Boolean(setup?.connected) && !purchaseVerified && setup?.decision !== "declined";

  const blocker = c.actions.items.find((i) => i.key === "readiness" || i.key === "billing");
  const waiting = c.actions.items.filter((i) => i.key.startsWith("d:") || i.key.startsWith("o:") || i.key === "suggested");

  // ---- Status and the figures Meta reported.
  const { live, review, paused } = c.campaigns.counts;
  const status = noCampaigns
    ? { text: "No ads yet", tone: "muted" as const }
    : live > 0
      ? { text: `${live} live`, tone: "live" as const }
      : review > 0
        ? { text: `${review} waiting for Meta`, tone: "warn" as const }
        : paused > 0
          ? { text: "Paused", tone: "muted" as const }
          : { text: "Not running", tone: "muted" as const };
  const metric = (key: string) => c.metrics.find((m) => m.key === key);
  const spend = metric("spend");
  const results = metric("results");
  const value = metric("value");
  const cost = metric("cost");
  const roas = o.current.roas !== null && (o.current.revenueCents ?? 0) > 0 ? `${o.current.roas.toFixed(2)}×` : null;
  const figures: { label: string; value: string }[] = [
    ...(spend?.value ? [{ label: "Spent", value: spend.value }] : []),
    ...(results?.value ? [{ label: results.label, value: results.value }] : []),
    ...(value?.value ? [{ label: value.label, value: value.value }] : []),
    ...(roas ? [{ label: "ROAS", value: roas }] : []),
  ];

  // ---- One summary, every sentence from a record.
  const summary: string[] = noCampaigns
    ? ["You haven't run a campaign with MAIRO yet. Tell it what you'd like to advertise and it builds the campaign for you to check — nothing spends until you approve it."]
    : c.results.empty
      ? [c.results.empty, ...(o.problems.length ? [o.problems[0].message] : [])]
      : c.results.insights.map((i) => i.text);
  if (!noCampaigns && !value?.value && !roas && !c.results.empty) {
    summary.push(trackingNeeded ? "Revenue isn't measured yet because purchase tracking isn't verified." : "Revenue isn't shown because no sale values were reported.");
  }

  // ---- The three questions, answered at the top, with one primary button.
  const now = rightNow({
    journey: journey && !journey.launched ? journey.next : null,
    meta: c.header.adAccount.state,
    blocker: blocker ? { title: blocker.title, why: blocker.why, href: blocker.href ?? "/dashboard/meta", cta: blocker.cta } : null,
    approvals: waiting.length,
    campaigns: { live, review, paused, total: o.campaigns.length },
    purchaseTracking: sellsOnline
      ? { verified: purchaseVerified, declined: setup?.decision === "declined", title: purchaseGate && !purchaseGate.ok ? PURCHASE_GAP[purchaseGate.code] : null, href: "/dashboard/pixel" }
      : null,
    figures: {
      spend: spend?.value ?? null,
      results: results?.value ?? null,
      resultsLabel: results?.label ?? "Results",
      cost: cost?.value ?? null,
      costLabel: cost?.label ?? "Cost per result",
      roas: sellsOnline ? roas : null,
    },
    unreadable: o.problems.length > 0,
    mode: manager?.mode.label ?? null,
  });

  const restingLabel = waiting.length > 0
    ? `${waiting.length} ${waiting.length === 1 ? "thing waits" : "things wait"} for your approval`
    : live > 0
      ? `Watching ${live} live campaign${live === 1 ? "" : "s"}`
      : noCampaigns
        ? "Ready when you are"
        : "Nothing needs you right now";

  return (
    <div className="mx-auto max-w-[760px]">
      {above && <div className="mb-6 space-y-4">{above}</div>}

      <header className="mb-7 flex flex-col items-center pt-1 text-center sm:pt-3">
        {/* MAIRO itself: at rest it shows the account as it is; it moves
            only when real work runs (lib/cinematic/activity.ts). */}
        <MairoCore resting={waiting.length > 0 ? "attention" : "idle"} restingLabel={restingLabel} size={96} className="mb-3" />
        <h1 className="v3-display text-[clamp(34px,5vw,60px)] text-white">{c.header.greeting.replace(/\.$/, "")}</h1>
        <p className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[14.5px] text-muted">
          <span>{c.header.business}</span>
          <span aria-hidden>·</span>
          <Pill tone={status.tone} dot>{status.text}</Pill>
          {c.header.adAccount.state !== "connected" && (
            <Link href={c.header.adAccount.href ?? "/dashboard/meta"} className="text-amber-200 underline underline-offset-4">
              {c.header.adAccount.state === "none" ? "Connect Meta" : "Meta needs attention"}
            </Link>
          )}
        </p>
      </header>

      {/* Right now: what MAIRO is doing, what needs you, what you're getting —
          and the one button that matters for this account's state. */}
      <section aria-labelledby="right-now" className="rounded-[24px] p-5 sm:p-6 mairo-glass" data-right-now={now.needs ? "needs-you" : "moving"}>
        <h2 id="right-now" className="v3-label">Right now</h2>
        <dl className="mt-3 space-y-4">
          <div>
            <dt className="text-[12.5px] text-muted">What MAIRO is doing</dt>
            <dd className="mt-0.5 text-[15.5px] leading-relaxed text-white">{now.doing}</dd>
          </div>
          <div>
            <dt className="text-[12.5px] text-muted">What needs you</dt>
            <dd className={`mt-0.5 text-[15.5px] leading-relaxed ${now.needs ? "font-medium text-white" : "text-white/85"}`}>
              {now.needs ? now.needs.text : "Nothing right now. MAIRO tells you here, and by email, when something needs your yes."}
            </dd>
          </div>
          <div>
            <dt className="text-[12.5px] text-muted">Results so far</dt>
            <dd className={`mt-0.5 text-[15.5px] leading-relaxed tabular-nums ${now.results.state === "reported" ? "text-white" : "text-white/75"}`} data-results={now.results.state}>
              {now.results.text}
            </dd>
          </div>
          {now.tracking && (
            <div>
              <dt className="text-[12.5px] text-muted">Purchase tracking</dt>
              <dd className="mt-0.5 flex items-start gap-2 text-[14.5px] leading-relaxed text-white/85" data-purchase-tracking={now.tracking.verified ? "verified" : "not-verified"}>
                <span aria-hidden className={`mt-[9px] shrink-0 ${now.tracking.verified ? "v3-dot" : "h-[7px] w-[7px] rounded-full bg-amber-300"}`} />
                {now.tracking.text}
              </dd>
            </div>
          )}
        </dl>
        <div className="mt-5">
          {now.primary.href.startsWith("http") ? (
            <a href={now.primary.href} target="_blank" rel="noopener noreferrer" className={btn}>{now.primary.cta}</a>
          ) : (
            <Link href={now.primary.href} className={btn}>{now.primary.cta}</Link>
          )}
        </div>
      </section>

      <div className="mt-8">
        <HomeComposer assistantName={name} />
      </div>

      {/* What MAIRO is doing for this business: tracking, what it may do on
          its own, and what it last did — each from a stored record. */}
      {manager && (
        <Section title="MAIRO is managing" action={{ href: "/dashboard/activity", label: "Everything MAIRO did" }}>
          <ul className="overflow-hidden rounded-[24px] mairo-glass">
            <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 v3-label">Tracking</span>
                <span className="mt-1 flex items-center gap-2 text-[15.5px] font-medium text-white">
                  <span aria-hidden className={manager.tracking.status === "working" ? "v3-dot" : manager.tracking.status === "attention" || manager.tracking.status === "broken" ? "h-[7px] w-[7px] shrink-0 rounded-full bg-amber-300" : "h-[7px] w-[7px] shrink-0 rounded-full bg-white/40"} />
                  {manager.tracking.headline}
                </span>
                <span className="mt-1 block text-[13.5px] leading-relaxed text-muted">{manager.tracking.detail}</span>
              </span>
              <Link href="/dashboard/pixel" className="shrink-0 text-[13.5px] text-white/80 underline decoration-white/25 underline-offset-4 hover:text-white">
                {manager.tracking.status === "working" ? "Details" : manager.tracking.status === "not_needed" ? "Tracking" : "Fix tracking"}
              </Link>
            </li>
            <li className="flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-start" style={{ borderColor: "var(--v3-line)" }}>
              <span className="min-w-0 flex-1">
                <span className="v3-label">What MAIRO may do</span>
                <span className="mt-1 flex items-center gap-2 text-[15.5px] font-medium text-white">
                  {manager.mode.key === "autopilot" && <span aria-hidden className="v3-dot" />}
                  {manager.mode.label}
                </span>
                <span className="mt-1 block text-[13.5px] leading-relaxed text-muted">{manager.mode.detail}</span>
              </span>
              {manager.mode.canToggle ? (
                <AutopilotToggle paused={manager.mode.key === "paused"} />
              ) : (
                <Link href="/dashboard/settings#automation" className="shrink-0 text-[13.5px] text-white/80 underline decoration-white/25 underline-offset-4 hover:text-white">
                  Autopilot settings
                </Link>
              )}
            </li>
            <li className="border-t px-5 py-4" style={{ borderColor: "var(--v3-line)" }}>
              <span className="v3-label">Lately</span>
              {manager.recent.length === 0 ? (
                <p className="mt-1 text-[14px] text-muted">Nothing changed in the last two weeks.</p>
              ) : (
                <ul className="mt-1.5 space-y-2">
                  {manager.recent.map((a) => (
                    <li key={a.id} className="text-[14px] leading-relaxed">
                      <span className="text-white">{a.summary}</span>{" "}
                      <span className="text-faint">
                        · {a.by} · {a.at.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {manager.failed > 0 && (
                <p className="mt-2 text-[13.5px] text-amber-200">
                  {manager.failed} change{manager.failed === 1 ? "" : "s"} MAIRO tried this week didn&rsquo;t go through.{" "}
                  <Link href="/dashboard/decisions" className="underline underline-offset-4">See why</Link>
                </p>
              )}
            </li>
          </ul>
        </Section>
      )}

      {/* How it's going, in a few words and the figures Meta reported. */}
      <Section title="MAIRO's summary" action={noCampaigns ? undefined : { href: "/dashboard/results", label: "Results" }}>
        <div className="rounded-[24px] p-5 sm:p-6 mairo-glass">
          <div className="space-y-2 text-[15px] leading-relaxed text-white/90">
            {summary.map((s) => (
              <p key={s}>{s}</p>
            ))}
          </div>
          {figures.length > 0 && (
            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t pt-5 sm:grid-cols-4" style={{ borderColor: "var(--v3-line)" }}>
              {figures.map((f) => (
                <div key={f.label} className="min-w-0">
                  <dd className="truncate text-[22px] font-medium tabular-nums text-white"><CountUp value={f.value} /></dd>
                  <dt className="text-[12.5px] text-muted">{f.label}</dt>
                </div>
              ))}
            </dl>
          )}
          {!noCampaigns && <p className="mt-4 text-[12px] text-faint">{c.period}, as Meta reports it.</p>}
        </div>
      </Section>

      {/* Anything waiting for a yes, MAIRO's recommendation first. */}
      {waiting.length > 0 && (
        <Section title="Waiting for your approval" action={{ href: "/dashboard/decisions", label: `All${c.actions.total > waiting.length ? ` ${c.actions.total}` : ""}` }}>
          <ul className="space-y-3">
            {waiting.slice(0, 3).map((item) => {
              const decision = c.actions.decisions[item.key];
              return (
                <li key={item.key} className="rounded-[24px] p-5 mairo-glass">
                  <p className="v3-label">MAIRO recommendation</p>
                  <p className="mt-1.5 text-[16px] font-medium text-white">{item.title}</p>
                  <p className="mt-1 line-clamp-3 text-[14px] leading-relaxed text-muted">{item.why}</p>
                  {item.impact?.text && <p className="mt-2 text-[13px] text-white/80">{item.impact.text}</p>}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {decision ? (
                      <DecisionControls decision={decision} />
                    ) : (
                      <Link href={item.href ?? "/dashboard/decisions"} className="inline-flex min-h-11 items-center rounded-full bg-white px-5 text-[14px] font-semibold text-black">
                        {item.cta}
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {/* The campaigns, briefly. */}
      {c.campaigns.rows.length > 0 && (
        <Section title="Your campaigns" action={{ href: "/dashboard/campaigns", label: "All campaigns" }}>
          <ul className="overflow-hidden rounded-[24px] mairo-glass">
            {c.campaigns.rows.slice(0, 3).map((r, i) => (
              <li key={r.id} className={i > 0 ? "border-t" : undefined} style={i > 0 ? { borderColor: "var(--v3-line)" } : undefined}>
                <Link href={r.href ?? `/dashboard/campaigns/${r.id}`} className="flex min-h-[64px] items-center gap-3 px-5 py-3 transition-colors hover:bg-white/[0.03]">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-white">{r.name}</span>
                    <span className="block truncate text-[12.5px] text-muted">
                      {[r.goal, r.budget, r.result].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <Pill tone={r.status.tone} dot>{r.status.label}</Pill>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {showPulse && <div className="mt-9"><PulseCard /></div>}
      <ResultsNote className="mt-10" />
    </div>
  );
}
