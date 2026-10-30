import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { fetchOrganizationPerformance } from "@/lib/ad-platforms/performance";
import type { PlatformMetrics } from "@/lib/ad-platforms/types";
import { goalFamilyOf, resultFor } from "@/lib/dashboard/console";
import { findings, resultsRange } from "@/lib/dashboard/results";
import { toView } from "@/lib/decisions/store";
import { loadPixelSetup } from "@/lib/tracking/pixel-setup";
import { DecisionControls } from "@/components/console/decision-controls";
import { ResultsNote } from "@/components/results-disclaimer";

// Results: what the ads cost and what came back, for one period.
//
// Five figures, big: Spend, the result the goal counts (purchases or leads),
// cost per result, revenue and ROAS. Then three short lists in plain words:
// what's working, what needs improvement, and what MAIRO recommends — each
// recommendation with the same Approve and Not now as the Approval Center,
// through the same confirmation. The advertising metrics (impressions, CTR,
// CPC, CPM) are behind "More details", and every figure is the one Meta
// reported: a figure it didn't report is said to be missing, never zero.
// The full figures, reports and history are unchanged at /dashboard/analytics
// and /dashboard/reports, linked from here.

export const metadata = { title: "Results — MAIRO" };
// Live reads from Meta for two periods.
export const maxDuration = 30;

const RANGES = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 Days" },
  { key: "30d", label: "30 Days" },
  { key: "custom", label: "Custom" },
] as const;

const usd = (cents: number | null | undefined) =>
  cents === null || cents === undefined
    ? null
    : (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: Math.abs(cents) >= 100_000 ? 0 : 2, maximumFractionDigits: Math.abs(cents) >= 100_000 ? 0 : 2 });
const whole = (n: number | null | undefined) => (n === null || n === undefined ? null : Math.round(n).toLocaleString("en-US"));

function change(now: number | null, before: number | null | undefined, goodWhen: "up" | "down" | "none"): { text: string; good: boolean | null } | null {
  if (now === null || before === null || before === undefined || before === 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  if (!Number.isFinite(pct)) return null;
  if (pct === 0) return { text: "Same as before", good: null };
  const up = pct > 0;
  return { text: `${up ? "▲" : "▼"} ${Math.abs(pct)}% vs the period before`, good: goodWhen === "none" ? null : goodWhen === "up" ? up : !up };
}

const surface = { borderColor: "var(--mairo-line)", background: "rgba(var(--mairo-fg-rgb),0.02)" };

function Block({ title, children, empty }: { title: string; children?: ReactNode; empty?: string | null }) {
  return (
    <section className="rounded-[24px] border p-5 sm:p-6" style={surface}>
      <h2 className="text-[16px] font-semibold text-white">{title}</h2>
      {empty ? <p className="mt-2 text-[14px] leading-relaxed text-muted">{empty}</p> : <div className="mt-3">{children}</div>}
    </section>
  );
}

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const period = resultsRange(await searchParams);

  const [now, before, family, pending, pixel, campaignCount] = await Promise.all([
    fetchOrganizationPerformance(organizationId, period.range),
    fetchOrganizationPerformance(organizationId, period.previous).catch(() => null),
    goalFamilyOf(organizationId),
    db.mairoDecision.findMany({ where: { organizationId, status: "PENDING" }, orderBy: [{ urgent: "desc" }, { createdAt: "desc" }], take: 3 }),
    loadPixelSetup(organizationId).catch(() => null),
    db.mairoCampaign.count({ where: { organizationId, status: { not: "ARCHIVED" } } }),
  ]);
  const m: PlatformMetrics = now.total;
  const p = before?.hasData ? before.total : null;
  const r = resultFor(family, m);
  const rp = p ? resultFor(family, p) : null;
  const per = r.value && m.spendCents !== null ? Math.round(m.spendCents / r.value) : null;
  const perBefore = p && rp?.value && p.spendCents !== null ? Math.round(p.spendCents / rp.value) : null;
  const reported = now.hasData;
  const unreadable = now.problems.length > 0;
  const trackingMissing = pixel?.need === "required_for_purchases" && !(pixel.status === "receiving" || pixel.status === "purchases_verified");
  const revenue = m.revenueCents && m.revenueCents > 0 ? m.revenueCents : null;
  const roas = revenue && m.spendCents ? revenue / m.spendCents : null;

  const missing = campaignCount === 0
    ? "Starts with your first campaign."
    : unreadable
      ? "Meta couldn't be read just now — missing, not zero."
      : "Nothing reported for this period.";
  const revenueMissing = campaignCount === 0
    ? missing
    : trackingMissing
      ? "Not measured: tracking isn't set up, so Meta can't count website sales."
      : family === "sales"
        ? "No sale values were reported for this period."
        : "Not measured for your goal — MAIRO counts your leads instead.";

  type Fig = { key: string; label: string; value: string | null; empty: string; change?: ReturnType<typeof change>; fix?: { href: string; label: string } };
  const figures: Fig[] = [
    { key: "spend", label: "Spend", value: reported ? usd(m.spendCents) : null, empty: missing, change: change(m.spendCents, p?.spendCents, "none") },
    { key: "results", label: r.label, value: reported && r.value !== null ? whole(r.value) : null, empty: reported ? `No ${r.label.toLowerCase()} reported for this period.` : missing, change: change(r.value, rp?.value, "up") },
    { key: "cost", label: r.costLabel, value: reported ? usd(per) : null, empty: reported ? `Shown once there are ${r.label.toLowerCase()} to divide by.` : missing, change: change(per, perBefore, "down") },
    { key: "revenue", label: "Revenue", value: usd(revenue), empty: revenueMissing, change: revenue ? change(revenue, p?.revenueCents, "up") : null, fix: trackingMissing ? { href: "/dashboard/pixel", label: "Fix tracking" } : undefined },
    { key: "roas", label: "ROAS", value: roas ? `${roas.toFixed(2)}×` : null, empty: revenue ? "Needs spend to compare with." : revenueMissing, change: roas && p?.roas ? change(roas, p.roas, "up") : null },
  ];

  const { working, improve } = findings(
    family,
    now.campaigns.map((c) => ({ id: c.mairoCampaignId, name: c.name, metrics: c.total, hasData: c.hasData })),
  );
  if (trackingMissing) improve.unshift({ key: "tracking", text: "Website purchases aren't being counted: your Meta Pixel isn't confirmed yet.", href: "/dashboard/pixel" });
  for (const problem of now.problems) improve.unshift({ key: `p:${problem.platform}`, text: problem.message });
  const decisions = pending.map(toView);

  const details: { label: string; value: string | null }[] = [
    { label: "Impressions", value: whole(m.impressions) },
    { label: "Reach", value: whole(m.reach) },
    { label: "Clicks", value: whole(m.clicks) },
    { label: "CTR", value: m.ctr === null ? null : `${(m.ctr * 100).toFixed(2)}%` },
    { label: "CPC", value: usd(m.cpcCents) },
    { label: "CPM", value: usd(m.cpmCents) },
  ];

  return (
    <div className="mx-auto max-w-[960px]">
      <header className="mb-5">
        <h1 className="text-[clamp(26px,3.4vw,34px)] font-semibold tracking-[-0.025em] text-white">Results</h1>
        <p className="mt-1 text-[14.5px] text-muted">{period.label}, as Meta reports it.</p>
      </header>

      <nav aria-label="Period" className="mb-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        {RANGES.map((x) => (
          <Link
            key={x.key}
            href={x.key === "custom" ? `/dashboard/results?range=custom&from=${period.from}&to=${period.to}` : `/dashboard/results?range=${x.key}`}
            aria-current={period.key === x.key ? "page" : undefined}
            className={`inline-flex min-h-10 shrink-0 items-center rounded-full px-4 text-[14px] transition ${period.key === x.key ? "bg-white font-medium text-black" : "border text-muted hover:text-white"}`}
            style={period.key === x.key ? undefined : { borderColor: "var(--mairo-line)" }}
          >
            {x.label}
          </Link>
        ))}
      </nav>
      {period.key === "custom" && (
        <form method="get" className="mb-5 flex flex-wrap items-end gap-3">
          <input type="hidden" name="range" value="custom" />
          <label className="text-[12.5px] text-muted">
            From
            <input type="date" name="from" defaultValue={period.from} className="mt-1 block min-h-11 rounded-xl border bg-transparent px-3 text-[16px] text-white" style={{ borderColor: "var(--mairo-line)" }} />
          </label>
          <label className="text-[12.5px] text-muted">
            To
            <input type="date" name="to" defaultValue={period.to} className="mt-1 block min-h-11 rounded-xl border bg-transparent px-3 text-[16px] text-white" style={{ borderColor: "var(--mairo-line)" }} />
          </label>
          <button type="submit" className="min-h-11 rounded-full bg-white px-5 text-[14px] font-semibold text-black">Show</button>
        </form>
      )}

      {/* The five figures. */}
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {figures.map((f, i) => (
          <div key={f.key} className={`rounded-[22px] border p-4 ${i === 0 ? "col-span-2 sm:col-span-1" : ""}`} style={surface}>
            <dt className="text-[13px] text-muted">{f.label}</dt>
            {f.value ? (
              <>
                <dd className="mt-1 truncate text-[26px] font-semibold tabular-nums tracking-[-0.02em] text-white">{f.value}</dd>
                {f.change && (
                  <dd className={`mt-1 text-[12px] ${f.change.good === null ? "text-faint" : f.change.good ? "text-emerald-300" : "text-amber-200"}`}>{f.change.text}</dd>
                )}
              </>
            ) : (
              <dd className="mt-2 text-[13px] leading-snug text-faint">
                {f.empty}
                {f.fix && (
                  <Link href={f.fix.href} className="mt-1.5 block text-[13px] text-white underline underline-offset-4">
                    {f.fix.label}
                  </Link>
                )}
              </dd>
            )}
          </div>
        ))}
      </dl>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Block title="What's working" empty={working.length ? null : reported ? "Nothing has brought results yet in this period." : missing}>
          <ul className="space-y-2.5">
            {working.map((f) => (
              <li key={f.key} className="text-[14.5px] leading-relaxed text-white/90">
                {f.href ? <Link href={f.href} className="hover:underline">{f.text}</Link> : f.text}
              </li>
            ))}
          </ul>
        </Block>
        <Block title="What needs improvement" empty={improve.length ? null : reported ? "Nothing stands out — every campaign with spend brought results." : missing}>
          <ul className="space-y-2.5">
            {improve.map((f) => (
              <li key={f.key} className="text-[14.5px] leading-relaxed text-white/90">
                {f.href ? <Link href={f.href} className="hover:underline">{f.text}</Link> : f.text}
              </li>
            ))}
          </ul>
        </Block>
      </div>

      <div className="mt-4">
        <Block title="What MAIRO recommends" empty={decisions.length ? null : "Nothing to change right now. MAIRO looks at your campaigns every day and asks here first — nothing changes until you approve."}>
          <ul className="space-y-5">
            {decisions.map((d) => (
              <li key={d.id}>
                <p className="text-[15.5px] font-medium text-white">{d.title}</p>
                <p className="mt-1 line-clamp-3 text-[14px] leading-relaxed text-muted">{`${d.noticed} ${d.whyItMatters}`.trim()}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link href={`/dashboard/decisions#d-${d.id}`} className="inline-flex min-h-[40px] items-center rounded-full border px-4 text-[13px] text-white/90" style={{ borderColor: "var(--mairo-line)" }}>
                    Review
                  </Link>
                  <DecisionControls decision={d} />
                </div>
              </li>
            ))}
          </ul>
        </Block>
      </div>

      <details className="group mt-6">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-1 text-[14px] text-muted hover:text-white [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="transition group-open:rotate-90">›</span> More details
        </summary>
        <div className="mt-3 rounded-[24px] border p-5" style={surface}>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {details.map((d) => (
              <div key={d.label}>
                <dt className="text-[12.5px] text-muted">{d.label}</dt>
                <dd className="mt-0.5 text-[18px] tabular-nums text-white">{d.value ?? "—"}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-[12.5px] text-faint">A dash means Meta didn&rsquo;t report that figure for this period.</p>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13.5px]">
            <Link href="/dashboard/analytics" className="text-white underline underline-offset-4">Every figure, campaign by campaign</Link>
            <Link href="/dashboard/reports" className="text-white underline underline-offset-4">Weekly and monthly reports</Link>
            <Link href="/dashboard/activity" className="text-white underline underline-offset-4">What MAIRO did</Link>
          </div>
        </div>
      </details>

      <ResultsNote className="mt-8" />
    </div>
  );
}
