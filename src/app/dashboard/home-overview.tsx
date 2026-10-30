import Link from "next/link";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { pulseDue } from "@/lib/success/store";
import { PULSE_LATER_COOKIE } from "@/lib/success/journey";
import { loadConsole } from "@/lib/dashboard/console";
import type { RangeDays } from "@/lib/dashboard/overview";
import { loadSimplePixel } from "@/lib/tracking/simple-view";
import { loadPixelSetup } from "@/lib/tracking/pixel-setup";
import { assistantNameOf } from "@/lib/ai/agents";
import { Pill } from "@/components/console/kit";
import { DecisionControls } from "@/components/console/decision-controls";
import { HomeComposer } from "@/components/dashboard/home/composer";
import { PulseCard } from "@/components/success/feedback";
import { ResultsNote } from "@/components/results-disclaimer";
import { MairoCore } from "@/components/cinematic/core";
import { CountUp } from "@/components/cinematic/count-up";

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

type Next = { title: string; text: string; href: string; cta: string };

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
  const [c, org, pixel, setup, pulseWanted, pulseLater] = await Promise.all([
    loadConsole(organizationId, userName, days),
    db.organization.findUnique({ where: { id: organizationId }, select: { assistantName: true } }),
    loadSimplePixel(organizationId).catch(() => null),
    loadPixelSetup(organizationId).catch(() => null),
    pulseDue(organizationId).catch(() => false),
    cookies().then((k) => k.get(PULSE_LATER_COOKIE)?.value === "1"),
  ]);
  const showPulse = askFeedback || (pulseWanted && !pulseLater);
  const name = assistantNameOf(org?.assistantName);
  const o = c.overview;
  const noCampaigns = o.campaigns.length === 0;

  // ---- The one next step: what's in the way first, then the first
  // campaign, then tracking a shop needs, then anything waiting, then results.
  const blocker = c.actions.items.find((i) => i.key === "readiness" || i.key === "billing");
  const firstSetup = c.actions.items.find((i) => i.key === "first");
  const trackingNeeded =
    Boolean(pixel?.view?.connected) && !pixel?.verified && setup?.need === "required_for_purchases" && setup?.decision !== "declined";
  const waiting = c.actions.items.filter((i) => i.key.startsWith("d:") || i.key.startsWith("o:") || i.key === "suggested");
  const next: Next & { key?: string } = blocker
    ? { key: blocker.key, title: blocker.title, text: blocker.why, href: blocker.href ?? "/dashboard/meta", cta: blocker.cta }
    : firstSetup
      ? { key: firstSetup.key, title: firstSetup.title, text: firstSetup.why, href: firstSetup.href ?? "/dashboard/launch", cta: "Continue setting up" }
      : noCampaigns
        ? { title: "Create your first campaign", text: "Tell MAIRO what you want to advertise. It builds the campaign and the ad, and shows you everything before anything spends.", href: "/dashboard/create", cta: "Create your first campaign" }
        : trackingNeeded
          ? { title: "Fix tracking", text: "Meta can't count website purchases from your ads yet. Set up your Pixel so MAIRO can measure sales — about five minutes.", href: "/dashboard/pixel", cta: "Fix tracking" }
          : waiting.length > 0
            ? { title: `${waiting.length === 1 ? "Something is" : `${waiting.length} things are`} waiting for your approval`, text: "Nothing changes in your ad account until you say yes.", href: "/dashboard/decisions", cta: "Review pending ads" }
            : { title: "Your ads are running", text: "Nothing needs you right now. MAIRO checks again every day.", href: "/dashboard/results", cta: "View results" };

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
    summary.push(trackingNeeded ? "Revenue isn't measured yet because tracking isn't set up." : "Revenue isn't shown because no sale values were reported.");
  }

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
        <MairoCore resting={waiting.length > 0 ? "attention" : "idle"} restingLabel={restingLabel} size={128} className="mb-3" />
        <h1 className="text-[clamp(26px,4vw,38px)] font-semibold leading-tight tracking-[-0.03em] text-white">{c.header.greeting}</h1>
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

      <HomeComposer assistantName={name} />

      {/* The one thing to do next. */}
      <section aria-labelledby="next-step" className="mt-8 rounded-[24px] p-5 sm:p-6 mairo-glass">
        <h2 id="next-step" className="text-[18px] font-semibold text-white">{next.title}</h2>
        <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">{next.text}</p>
        <div className="mt-4">
          {next.href.startsWith("http") ? (
            <a href={next.href} target="_blank" rel="noopener noreferrer" className={btn}>{next.cta}</a>
          ) : (
            <Link href={next.href} className={btn}>{next.cta}</Link>
          )}
        </div>
      </section>

      {/* How it's going, in a few words and the figures Meta reported. */}
      <Section title="MAIRO's summary" action={noCampaigns ? undefined : { href: "/dashboard/results", label: "Results" }}>
        <div className="rounded-[24px] p-5 sm:p-6 mairo-glass">
          <div className="space-y-2 text-[15px] leading-relaxed text-white/90">
            {summary.map((s) => (
              <p key={s}>{s}</p>
            ))}
          </div>
          {figures.length > 0 && (
            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t pt-5 sm:grid-cols-4" style={{ borderColor: "var(--mairo-line)" }}>
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
                  <p className="text-[11.5px] font-medium uppercase tracking-[0.12em] text-faint">MAIRO recommendation</p>
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
              <li key={r.id} className={i > 0 ? "border-t" : undefined} style={i > 0 ? { borderColor: "var(--mairo-line)" } : undefined}>
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
