import Link from "next/link";
import type { PlatformMetrics } from "@/lib/ad-platforms/types";
import type { CampaignHealth } from "@/lib/campaigns/health";
import type { DecisionCounts } from "@/lib/decisions/store";
import type { ActivityEntry } from "@/lib/activity/log";
import { ActivityTimeline } from "./activity-timeline";

// MAIRO TODAY — the top of the dashboard.
//
//   Good morning.
//   Your ads spent $184 yesterday and generated $742 in tracked revenue.
//   Mairo found 3 ways to improve your campaigns.   [Review Decisions]
//
// Every number is the account's own. Revenue is "tracked revenue" because
// that's what it is; profit only appears when the business has told MAIRO
// its margin; and "What Mairo is doing" only lists what is actually running.

export type DoingItem = { label: string; status: string; on: boolean };

function money(cents: number | null): string {
  if (cents === null) return "—";
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents >= 100_000 ? 0 : 2 });
}

function greeting(hour: number): string {
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export function MairoToday({
  firstName,
  hour,
  yesterday,
  total,
  health,
  counts,
  marginPercent,
  doing,
  recent,
  advanced,
}: {
  firstName: string;
  hour: number;
  yesterday: PlatformMetrics | null;
  total: PlatformMetrics;
  health: CampaignHealth;
  counts: DecisionCounts;
  marginPercent: number | null;
  doing: DoingItem[];
  recent: ActivityEntry[];
  advanced: boolean;
}) {
  const spentYesterday = yesterday?.spendCents ?? null;
  const revenueYesterday = yesterday?.revenueCents ?? null;
  const customers = total.purchases ?? total.conversions;
  const costPerCustomer = customers && total.spendCents ? Math.round(total.spendCents / customers) : null;
  const profit =
    marginPercent !== null && total.revenueCents !== null && total.spendCents !== null
      ? Math.round(total.revenueCents * (marginPercent / 100) - total.spendCents)
      : null;

  const line =
    spentYesterday === null || spentYesterday === 0
      ? "Your ads didn't spend anything yesterday."
      : revenueYesterday !== null && revenueYesterday > 0
        ? `Your ads spent ${money(spentYesterday)} yesterday and generated ${money(revenueYesterday)} in tracked revenue.`
        : `Your ads spent ${money(spentYesterday)} yesterday. No revenue was tracked — set up Tracking so Mairo can see sales.`;

  const metrics: { label: string; advancedLabel: string; value: string; help: string }[] = [
    { label: "Campaign health", advancedLabel: "Account health", value: health.label, help: health.summary },
    { label: "Ad spend", advancedLabel: "Spend", value: money(total.spendCents), help: "What the ad networks have charged you. Paid to them directly." },
    { label: "Revenue", advancedLabel: "Tracked revenue", value: money(total.revenueCents), help: "Sales your tracking reported as coming from the ads." },
    ...(profit !== null
      ? [{ label: "Profit after ads", advancedLabel: "Profit (est.)", value: money(profit), help: `Revenue × your ${marginPercent}% margin, minus ad spend. An estimate from the margin in your Business Brain.` }]
      : []),
    { label: "Customers", advancedLabel: "Conversions", value: customers === null ? "—" : String(customers), help: "Purchases or leads the ads brought in." },
    { label: "Cost per customer", advancedLabel: "CPA", value: money(costPerCustomer), help: "What you paid in ads for each customer, on average." },
    { label: "Return per $1", advancedLabel: "ROAS", value: total.roas === null ? "—" : advanced ? `${total.roas.toFixed(2)}x` : `$${total.roas.toFixed(2)}`, help: "How much came back for every $1 spent on ads." },
  ];

  return (
    <section className="mb-8 rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--mairo-line-lit)", background: "rgba(var(--mairo-bg-rgb),0.6)", boxShadow: "var(--mairo-glow-soft)" }}>
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue-bright">Mairo today</p>
      <h2 className="mt-2 text-[20px] font-medium text-white">
        {greeting(hour)}
        {firstName ? `, ${firstName}` : ""}.
      </h2>
      <p className="mt-1 text-[14px] text-white/85">{line}</p>

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div>
          <p className="text-[15px] text-white">
            {counts.pending === 0
              ? "Nothing needs deciding right now."
              : `Mairo found ${counts.pending} way${counts.pending === 1 ? "" : "s"} to improve your campaigns.`}
          </p>
          {counts.pending > 0 && (
            <p className="mt-1 text-[12.5px] text-muted">
              {counts.pending} Mairo Decision{counts.pending === 1 ? "" : "s"}
              {counts.urgent > 0 && <span className="text-red-300"> · {counts.urgent} need{counts.urgent === 1 ? "s" : ""} attention</span>}
              {counts.growth > 0 && <span className="text-live"> · {counts.growth} growth opportunit{counts.growth === 1 ? "y" : "ies"}</span>}
            </p>
          )}
        </div>
        <Link
          href="/dashboard/decisions"
          className="rounded-full px-5 py-2.5 text-[13px] font-medium text-white sm:ml-auto"
          style={{ backgroundImage: "var(--mairo-ramp)", boxShadow: "var(--mairo-glow-key)" }}
        >
          Review Decisions
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-7">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--mairo-line)" }} title={m.help}>
            <p className="flex items-center gap-1 text-[11px] text-faint">
              {advanced ? m.advancedLabel : m.label}
              <span aria-label={m.help} className="cursor-help">ⓘ</span>
            </p>
            <p className="mt-0.5 truncate text-[15px] font-medium tabular-nums text-white">{m.value}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-faint">Totals since your first campaign. <Link href="/dashboard/analytics" className="underline underline-offset-2 hover:text-white">Full breakdown</Link></p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">What Mairo is doing</p>
          <ul className="mt-3 space-y-2">
            {doing.map((d) => (
              <li key={d.label} className="flex items-start gap-2.5 text-[13px]">
                <span aria-hidden className="mt-[6px] h-2 w-2 shrink-0 rounded-full" style={{ background: d.on ? "#34d399" : "rgba(var(--mairo-fg-rgb),0.18)" }} />
                <span>
                  <span className={d.on ? "text-white" : "text-muted"}>{d.label}</span>
                  <span className="block text-[12px] text-faint">{d.status}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">Mairo activity</p>
            <Link href="/dashboard/activity" className="text-[12px] text-muted hover:text-white">All activity →</Link>
          </div>
          <div className="mt-3">
            <ActivityTimeline entries={recent} compact />
          </div>
        </div>
      </div>
    </section>
  );
}
