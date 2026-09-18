import Link from "next/link";
import type { ReactNode } from "react";
import type { OrganizationReport } from "@/lib/ad-platforms/performance";
import { GlassPanel, MairoButton, MairoCard, AIStatus } from "@/components/mairo";
import { ResultsNote } from "@/components/results-disclaimer";
import type { CampaignHealth } from "@/lib/campaigns/health";
import type { ActionEntry } from "@/lib/campaigns/action-log";
import type { AutomationLevel } from "@/generated/prisma/enums";
import { SpendControls, type SpendFigures } from "@/components/mairo/spend-controls";
import { CampaignHealthPanel, AIActionCard } from "@/components/mairo/campaign-parts";

// Simple View, built from the MAIRO dashboard reference.
//
// The composition is the reference's: a lit hero band with the greeting, the
// statement and two actions, a glowing core to its right; a row of four metric
// tiles with icons; campaigns as a table on the left with the assistant beside
// it; two wide action cards across the bottom.
//
// Two rules decide the content inside that composition, and they are the
// reason this is not a pixel copy.
//
// Plain words first, jargon second. "Return" is the heading, "ROAS" is the
// small grey line under it. A dashboard that opens with CPA and CTR asks
// someone to learn a vocabulary before they can find out how their own
// business is doing, which is the problem this product exists to remove.
//
// And nothing is invented. The reference shows $20,736, 3.2x and "↑ 28%" —
// those are render figures, and this screen shows whatever the connected ad
// account actually returned. PlatformMetrics already separates null ("the
// platform has not told us") from zero ("the ads ran and nobody bought"), and
// that distinction survives to the screen as an em dash rather than a
// confident $0.00. The sparkline and the percentage change in the reference
// need a previous period and a daily series, neither of which the performance
// API returns yet, so they are not drawn rather than drawn from nothing.

/* ------------------------------------------------------------------ format */

const money = (cents: number | null | undefined): string | null =>
  cents === null || cents === undefined
    ? null
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
      }).format(cents / 100);

const count = (n: number | null | undefined): string | null =>
  n === null || n === undefined ? null : new Intl.NumberFormat("en-US").format(n);

/* ------------------------------------------------------------------- icons */

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const ICONS = {
  revenue: (
    <svg viewBox="0 0 20 20" {...stroke} aria-hidden>
      <path d="M10 15.5V4.5M6 8l4-4 4 4" />
    </svg>
  ),
  spend: (
    <svg viewBox="0 0 20 20" {...stroke} aria-hidden>
      <path d="M4 16V10M10 16V5M16 16v-4" />
    </svg>
  ),
  roas: (
    <svg viewBox="0 0 20 20" {...stroke} aria-hidden>
      <path d="M3.5 13.5l4-4.5 3 2.5 6-6.5" />
      <path d="M12.5 5h4v4" />
    </svg>
  ),
  results: (
    <svg viewBox="0 0 20 20" {...stroke} aria-hidden>
      <circle cx="7.6" cy="7" r="2.5" />
      <circle cx="13.8" cy="8.4" r="1.9" />
      <path d="M3.2 15.6c0-2.2 2-3.9 4.4-3.9s4.4 1.7 4.4 3.9" />
      <path d="M13.4 12.3c1.9.3 3.4 1.6 3.4 3.3" />
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 20 20" {...stroke} aria-hidden>
      <rect x="3" y="3.5" width="14" height="13" rx="2.2" />
      <path d="M6.5 13V9M10 13V7M13.5 13v-2.5" />
    </svg>
  ),
  bulb: (
    <svg viewBox="0 0 20 20" {...stroke} aria-hidden>
      <path d="M7.6 14.5h4.8M8.4 17h3.2" />
      <path d="M10 3a4.6 4.6 0 0 0-2.7 8.3c.4.3.6.7.6 1.2h4.2c0-.5.2-.9.6-1.2A4.6 4.6 0 0 0 10 3z" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 20 20" {...stroke} aria-hidden>
      <path d="M17 10.5a6 6 0 0 1-6 6H4.5l1.2-2.6A6 6 0 1 1 17 10.5z" />
    </svg>
  ),
  rocket: (
    <svg viewBox="0 0 20 20" {...stroke} aria-hidden>
      <path d="M11.5 3.5c3 1 5 3 5.5 5.5-2 2.5-4.5 4.5-7.5 5.5L6 11 11.5 3.5z" />
      <path d="M6 11l-2 3 3-1" />
    </svg>
  ),
  image: (
    <svg viewBox="0 0 20 20" {...stroke} aria-hidden>
      <rect x="2.8" y="4" width="14.4" height="12" rx="2.4" />
      <circle cx="7.3" cy="8.2" r="1.3" />
      <path d="M3.4 13.6l3.9-3.9 3.4 3.4 2.4-2 3.2 3.2" />
    </svg>
  ),
  people: (
    <svg viewBox="0 0 20 20" {...stroke} aria-hidden>
      <circle cx="7.6" cy="7" r="2.5" />
      <circle cx="13.8" cy="8.4" r="1.9" />
      <path d="M3.2 15.6c0-2.2 2-3.9 4.4-3.9s4.4 1.7 4.4 3.9" />
      <path d="M13.4 12.3c1.9.3 3.4 1.6 3.4 3.3" />
    </svg>
  ),
};

/* ------------------------------------------------------------- the metrics */

/**
 * One tile from the reference's metric row: icon in a tinted square, label,
 * the number, and the advertising term underneath in grey.
 */
function Metric({
  icon,
  label,
  value,
  technical,
  explain,
  accent = false,
}: {
  icon: ReactNode;
  label: string;
  value: string | null;
  technical?: string;
  explain?: string;
  accent?: boolean;
}) {
  const empty = value === null;
  return (
    <GlassPanel lit={accent && !empty} className="p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-blue-bright"
          style={{ borderColor: "var(--mairo-line)", background: "rgba(61,125,255,0.10)" }}
        >
          <span className="h-[18px] w-[18px]">{icon}</span>
        </span>
        <p className="text-[13px] text-muted">{label}</p>
      </div>

      <p
        className={`mt-3 text-[24px] font-semibold leading-none tracking-[-0.02em] tabular-nums sm:text-[28px] ${
          empty ? "text-faint" : "text-white"
        }`}
      >
        {value ?? "—"}
      </p>

      {empty ? (
        <p className="mt-2 text-[11px] text-faint">No data yet</p>
      ) : (
        <>
          {technical && <p className="mt-1.5 font-mono text-[10px] text-faint">{technical}</p>}
          {explain && <p className="mt-2 text-[11px] leading-relaxed text-muted">{explain}</p>}
        </>
      )}
    </GlassPanel>
  );
}

/* ---------------------------------------------------------------- the core */

/** The glowing sphere from the reference's hero band, at panel scale. */
function HeroOrb() {
  return (
    <div className="relative hidden w-[210px] shrink-0 lg:block" aria-hidden>
      <div
        className="absolute inset-[-40%]"
        style={{
          background:
            "radial-gradient(closest-side, rgba(61,125,255,0.38), rgba(61,125,255,0.10) 48%, transparent 76%)",
        }}
      />
      <svg viewBox="0 0 200 200" className="relative w-full">
        <defs>
          <radialGradient id="mairo-orb" cx="38%" cy="32%" r="72%">
            <stop offset="0%" stopColor="#9ec8ff" stopOpacity="0.45" />
            <stop offset="52%" stopColor="#1b49c9" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#05070f" stopOpacity="0.95" />
          </radialGradient>
          <linearGradient id="mairo-orb-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6aa6ff" stopOpacity="0.05" />
            <stop offset="42%" stopColor="#6aa6ff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.1" />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r="62" fill="url(#mairo-orb)" />
        <circle cx="100" cy="100" r="62" fill="none" stroke="#9cc4ff" strokeOpacity="0.4" strokeWidth="1" />
        <g className="mairo-orb-spin" style={{ transformOrigin: "100px 100px" }}>
          <ellipse cx="100" cy="100" rx="86" ry="34" fill="none" stroke="url(#mairo-orb-ring)" strokeWidth="1.4" />
        </g>
        <g className="mairo-orb-spin-slow" style={{ transformOrigin: "100px 100px" }}>
          <ellipse cx="100" cy="100" rx="34" ry="86" fill="none" stroke="url(#mairo-orb-ring)" strokeWidth="1.2" />
        </g>
        {/* The crescent that gives it the lit-from-behind look. */}
        <path
          d="M64 118a44 44 0 0 0 72 0"
          fill="none"
          stroke="#8fc0ff"
          strokeOpacity="0.75"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      <style>{`
        .mairo-orb-spin { animation: mairo-orb-spin 34s linear infinite; }
        .mairo-orb-spin-slow { animation: mairo-orb-spin 52s linear infinite reverse; }
        @keyframes mairo-orb-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .mairo-orb-spin, .mairo-orb-spin-slow { animation: none; }
        }
      `}</style>
    </div>
  );
}

/* -------------------------------------------------------------- the screen */

export type SimpleDashboardProps = {
  firstName: string;
  performance: OrganizationReport;
  campaigns: { id: string; name: string; status: string; platforms: string[] }[];
  notices: string[];
  anyConnected: boolean;
  /** One word and one sentence for the account as a whole. */
  health: CampaignHealth;
  /** What MAIRO has changed by itself, newest first. Real rows only. */
  actions: ActionEntry[];
  /** What this business calls its assistant. Default "Alex". */
  assistantName: string;
  /** Money out, and the ceilings around it. */
  spend: SpendFigures;
  /** How much MAIRO may do without asking. */
  automationLevel: AutomationLevel;
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const QUESTIONS: { icon: ReactNode; text: string }[] = [
  { icon: ICONS.chart, text: "How are my campaigns doing?" },
  { icon: ICONS.image, text: "Give me creative ideas" },
  { icon: ICONS.bulb, text: "What should I improve?" },
  { icon: ICONS.rocket, text: "Help me launch a campaign" },
];

function statusTone(status: string): { dot: string; text: string } {
  if (status === "ACTIVE") return { dot: "bg-live", text: "text-live" };
  if (status === "PAUSED") return { dot: "bg-warn", text: "text-warn" };
  return { dot: "bg-faint", text: "text-muted" };
}

export function SimpleDashboard({
  firstName,
  performance,
  campaigns,
  notices,
  anyConnected,
  health,
  actions,
  assistantName,
  spend,
  automationLevel,
}: SimpleDashboardProps) {
  const t = performance.total;

  const roas =
    t.roas ??
    (t.revenueCents !== null && t.spendCents !== null && t.spendCents > 0
      ? t.revenueCents / t.spendCents
      : null);

  const results = t.purchases ?? t.conversions ?? null;

  return (
    <div className="mx-auto max-w-[1280px] space-y-5">
      {/* ================= hero band ================= */}
      <GlassPanel lit className="overflow-hidden p-6 sm:p-8">
        <div className="flex items-center gap-8">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-muted">
              {greeting()}
              {firstName ? `, ${firstName}` : ""}
            </p>

            <h1 className="mt-2.5 text-[clamp(26px,4.4vw,40px)] font-semibold leading-[1.1] tracking-[-0.03em] text-white">
              Let Mairo{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "var(--mairo-ramp-soft)" }}
              >
                run your ads.
              </span>
            </h1>

            <p className="mt-3 max-w-md text-[14px] leading-relaxed text-muted">
              Create better ads. Reach more customers. Understand what is working.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <MairoButton href="/dashboard/create" className="w-full sm:w-auto">
                <span aria-hidden className="text-[16px] leading-none">
                  +
                </span>
                Create new campaign
              </MairoButton>
              <MairoButton href="/dashboard/agents" tone="ghost" className="w-full sm:w-auto">
                <span aria-hidden className="h-4 w-4 text-blue-bright">
                  {ICONS.chat}
                </span>
                Talk to {assistantName}
              </MairoButton>
            </div>
          </div>

          <div className="relative hidden lg:block">
            <HeroOrb />
            <div
              className="absolute -top-1 right-0 flex items-center gap-2 rounded-xl border px-3 py-2"
              style={{ borderColor: "var(--mairo-line-lit)", background: "rgba(10,16,32,0.85)" }}
            >
              <span className="text-[12px] font-medium text-white">Mairo AI</span>
              <AIStatus label="Online" />
            </div>
          </div>
        </div>
      </GlassPanel>

      {/* ================= metrics ================= */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
        <Metric icon={ICONS.revenue} label="Revenue" value={money(t.revenueCents)} technical="Tracked revenue" />
        <Metric icon={ICONS.spend} label="Ad spend" value={money(t.spendCents)} technical="Amount spent" />
        <Metric
          icon={ICONS.roas}
          label="Return"
          accent
          value={roas === null ? null : `${roas.toFixed(1)}x`}
          technical={roas === null ? undefined : `ROAS: ${roas.toFixed(2)}x`}
          explain={
            roas === null
              ? undefined
              : `About ${money(Math.round(roas * 100))} back for every $1 spent.`
          }
        />
        <Metric
          icon={ICONS.results}
          label="Results"
          value={count(results)}
          technical={results === null ? undefined : "Purchases or leads"}
        />

        {/* The reference puts a date selector here. It is a label rather than a
            dropdown because the underlying report is fetched with Meta's
            "maximum" preset — everything since the account started — and a
            control saying "Last 30 days" over all-time figures would be
            wrong in the one place a customer checks their numbers. It becomes
            a real selector when the range is plumbed through. */}
        <div className="col-span-2 xl:col-span-1">
          <GlassPanel className="flex h-full items-center gap-2.5 px-4 py-3">
            <span className="h-4 w-4 shrink-0 text-faint">
              <svg viewBox="0 0 20 20" {...stroke} aria-hidden>
                <rect x="3" y="4.5" width="14" height="12" rx="2.2" />
                <path d="M3 8.5h14M7 3v3M13 3v3" />
              </svg>
            </span>
            <span className="text-[12px] text-muted">All time</span>
          </GlassPanel>
        </div>
      </div>

      {/* ================= campaigns + assistant ================= */}
      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        {/* ---- Your campaigns ---- */}
        {/* How it is going, then what MAIRO has been doing about it. This is the
            whole promise of the product in two panels: somebody who does not
            know what CPA means can still tell whether their advertising is
            working and whether anything is being done. */}
        <CampaignHealthPanel health={health} className="mb-6" />

        {/* Directly above the log of what MAIRO changed, because the two
            questions are one question: what is it allowed to do, and what has
            it done. Split across two screens they are much less reassuring. */}
        <SpendControls figures={spend} level={automationLevel} className="mb-6" />

        <GlassPanel className="mb-6 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[16px] font-medium text-white">What Mairo is doing</h2>
            {actions.length > 0 && (
              <Link
                href="/dashboard/campaigns"
                className="text-[12px] text-blue-bright hover:text-white"
              >
                See all
              </Link>
            )}
          </div>
          {actions.length === 0 ? (
            <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-muted">
              {anyConnected
                ? "Nothing has needed changing yet. Mairo leaves a campaign alone while the platform is still learning who to show it to — and every change it does make will appear here, with the numbers behind it."
                : "Once a campaign is running, everything Mairo changes shows up here — what it changed, and why."}
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {actions.slice(0, 4).map((a) => (
                <AIActionCard key={a.id} entry={a} showCampaign />
              ))}
            </div>
          )}
        </GlassPanel>

        <GlassPanel className="p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-medium text-white">Your campaigns</h2>
            {campaigns.length > 0 && (
              <Link href="/dashboard/campaigns" className="text-[12px] text-blue-bright hover:text-white">
                View all
              </Link>
            )}
          </div>

          {campaigns.length === 0 ? (
            <div className="py-10 text-center sm:py-14">
              <h3 className="text-[16px] font-medium text-white">No campaigns yet</h3>
              <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-muted">
                Tell Mairo what you sell and what you want to happen. It builds the campaign and
                brings it back for you to approve — nothing spends until you say so.
              </p>
              <div className="mt-6 flex justify-center">
                <MairoButton href="/dashboard/create">
                  Create your first campaign
                  <span aria-hidden>→</span>
                </MairoButton>
              </div>
            </div>
          ) : (
            <div className="-mx-2 mt-5 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse">
                <thead>
                  <tr className="text-left">
                    {["Campaign", "Status", "Results", "Return", "Spend"].map((h) => (
                      <th
                        key={h}
                        scope="col"
                        className="px-2 pb-3 font-mono text-[10px] font-normal uppercase tracking-[0.14em] text-faint"
                      >
                        {h}
                      </th>
                    ))}
                    <th className="w-6" />
                  </tr>
                </thead>
                <tbody>
                  {campaigns.slice(0, 3).map((c) => {
                    const report = performance.campaigns.find((r) => r.mairoCampaignId === c.id);
                    const m = report?.total;
                    const cRoas =
                      m?.roas ??
                      (m && m.revenueCents !== null && m.spendCents !== null && m.spendCents > 0
                        ? m.revenueCents / m.spendCents
                        : null);
                    const cResults = m?.purchases ?? m?.conversions ?? null;
                    const tone = statusTone(c.status);

                    return (
                      <tr
                        key={c.id}
                        className="border-t transition-colors hover:bg-white/[0.03]"
                        style={{ borderColor: "var(--mairo-line)" }}
                      >
                        <td className="px-2 py-4">
                          <Link href="/dashboard/campaigns" className="block">
                            <span className="block truncate text-[14px] font-medium text-white">
                              {c.name}
                            </span>
                            <span className="mt-0.5 block text-[11px] text-faint">
                              {c.platforms.length > 0 ? c.platforms.join(" + ") : "No platform yet"}
                            </span>
                          </Link>
                        </td>
                        <td className="px-2 py-4">
                          <span className="inline-flex items-center gap-2">
                            <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden />
                            <span className={`text-[12px] capitalize ${tone.text}`}>
                              {c.status.toLowerCase()}
                            </span>
                          </span>
                        </td>
                        <td className="px-2 py-4 text-[13px] tabular-nums text-white">
                          {count(cResults) ?? "—"}
                        </td>
                        <td className="px-2 py-4 text-[13px] tabular-nums text-white">
                          {cRoas === null ? "—" : `${cRoas.toFixed(1)}x`}
                        </td>
                        <td className="px-2 py-4 text-[13px] tabular-nums text-white">
                          {money(m?.spendCents ?? null) ?? "—"}
                        </td>
                        <td className="px-2 py-4 text-right">
                          <Link
                            href="/dashboard/campaigns"
                            className="text-faint hover:text-white"
                            aria-label={`Open ${c.name}`}
                          >
                            <span aria-hidden>›</span>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </GlassPanel>

        {/* ---- Mairo AI assistant ---- */}
        <GlassPanel className="flex flex-col p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-medium text-white">{assistantName}</h2>
            <AIStatus label="Online" />
          </div>

          <ul className="mt-5 space-y-2.5">
            {QUESTIONS.map((q) => (
              <li key={q.text}>
                <Link
                  href={`/dashboard/agents?ask=${encodeURIComponent(q.text)}`}
                  className="flex items-center gap-3 rounded-xl border px-3.5 py-3 text-[13px] text-muted transition-all duration-300 [transition-timing-function:var(--ease-mairo)] hover:border-[color:var(--mairo-line-lit)] hover:bg-white/[0.04] hover:text-white"
                  style={{ borderColor: "var(--mairo-line)" }}
                >
                  <span className="h-4 w-4 shrink-0 text-blue-bright">{q.icon}</span>
                  {q.text}
                </Link>
              </li>
            ))}
          </ul>

          <Link
            href="/dashboard/agents"
            className="mt-auto flex items-center gap-3 rounded-full border px-4 py-2.5 pt-2.5 text-[13px] text-faint transition-colors hover:text-muted"
            style={{ borderColor: "var(--mairo-line)", marginTop: "1.25rem" }}
          >
            Ask {assistantName} anything…
            <span
              aria-hidden
              className="ml-auto flex h-7 w-7 items-center justify-center rounded-full text-white"
              style={{ backgroundImage: "var(--mairo-ramp)" }}
            >
              →
            </span>
          </Link>

          {/* What Mairo actually noticed, under the prompts rather than in its
              own panel — a recommendation is the assistant talking. */}
          <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--mairo-line)" }}>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
              Mairo noticed
            </p>
            {notices.length > 0 ? (
              <ul className="mt-2.5 space-y-2">
                {notices.slice(0, 2).map((n) => (
                  <li key={n} className="text-[12px] leading-relaxed text-muted">
                    {n}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2.5 text-[12px] leading-relaxed text-muted">
                {campaigns.length === 0
                  ? "Once your first campaign is running, Mairo will show what it finds here."
                  : "Your campaigns are collecting data. Mairo will show recommendations when there is enough of it to say something useful."}
              </p>
            )}
          </div>
        </GlassPanel>
      </div>

      {/* ================= the two wide actions ================= */}
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          {
            href: "/dashboard/creatives",
            icon: ICONS.image,
            title: "Generate ad creatives",
            body: "Turn what you sell into ad concepts, headlines and hooks.",
          },
          anyConnected
            ? {
                href: "/dashboard/audiences",
                icon: ICONS.people,
                title: "Find new audiences",
                body: "Let Mairo work out who your ads should be shown to.",
              }
            : {
                href: "/dashboard/integrations",
                icon: ICONS.people,
                title: "Connect an advertising account",
                body: "Link Meta or TikTok so campaigns can go live in your own account.",
              },
        ].map((a) => (
          <MairoCard key={a.title} href={a.href} className="p-5 sm:p-6">
            <div className="flex items-center gap-4">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-blue-bright"
                style={{ borderColor: "var(--mairo-line)", background: "rgba(61,125,255,0.10)" }}
              >
                <span className="h-5 w-5">{a.icon}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium text-white">{a.title}</span>
                <span className="mt-1 block text-[12.5px] leading-relaxed text-muted">{a.body}</span>
              </span>
              <span aria-hidden className="text-faint">
                ›
              </span>
            </div>
          </MairoCard>
        ))}
      </div>

      {/* Two different things, said separately. The first is about the numbers
          on this screen being stale; the second is about what MAIRO can promise
          at all. They were one paragraph, which meant the second half was
          phrased here and phrased differently everywhere else — and a
          disclaimer that exists in four wordings is the weakest of the four. */}
      <p className="pt-1 text-[11px] leading-relaxed text-faint">
        Figures are read from your connected advertising accounts and may lag behind the platform by
        a few hours.
      </p>
      <ResultsNote className="text-[11px]" />
    </div>
  );
}

/** Keeps "what does this person call themselves" in one place. */
export function firstNameFrom(name: string | null | undefined, fallback: string): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first || fallback;
}
