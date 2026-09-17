import Link from "next/link";
import type { OrganizationReport } from "@/lib/ad-platforms/performance";
import { GlassPanel, MairoButton, MairoCard, AIStatus } from "@/components/mairo";

// Simple View.
//
// Written for the person the whole product exists for: someone who runs a shop
// and has never opened Ads Manager. Two rules follow from that and they decide
// everything on this screen.
//
// Plain words carry the meaning and the jargon comes second. "Return" is the
// heading; "ROAS 4.2x" is the small grey line under it, there so that the day
// they talk to an agency they recognise the word. Never the other way round —
// a dashboard that opens with CPA and CTR is asking someone to learn a
// vocabulary before they can find out how their business is doing.
//
// And nothing is invented. Every figure here is null when the platform did not
// return it, which is a different thing from zero: zero means the ads ran and
// nobody bought, null means nobody has told us yet. They read as "—" and "No
// data yet", never as a confident $0.00.

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

/* ------------------------------------------------------------------ metric */

/**
 * One of the four numbers.
 *
 * `technical` is the advertising term, shown small underneath. `explain` is the
 * sentence that makes the number mean something — present on Return, because
 * "4.2x" is the one figure on this screen that is meaningless to a beginner
 * without it.
 */
function SimpleMetric({
  label,
  value,
  technical,
  explain,
  accent = false,
}: {
  label: string;
  value: string | null;
  technical?: string;
  explain?: string;
  accent?: boolean;
}) {
  const empty = value === null;
  return (
    <GlassPanel lit={accent && !empty} className="p-5 sm:p-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint">{label}</p>
      <p
        className={`mt-3 text-[28px] font-semibold leading-none tracking-[-0.02em] sm:text-[34px] ${
          empty ? "text-faint" : "text-white"
        }`}
      >
        {value ?? "—"}
      </p>
      {empty ? (
        <p className="mt-2 text-[12px] text-faint">No data yet</p>
      ) : (
        <>
          {technical && <p className="mt-2 font-mono text-[11px] text-faint">{technical}</p>}
          {explain && <p className="mt-2 text-[12px] leading-relaxed text-muted">{explain}</p>}
        </>
      )}
    </GlassPanel>
  );
}

/* -------------------------------------------------------------- the screen */

export type SimpleDashboardProps = {
  firstName: string;
  performance: OrganizationReport;
  campaigns: { id: string; name: string; status: string }[];
  /** Plain sentences from the recommendation engine. Empty when there is nothing true to say. */
  notices: string[];
  anyConnected: boolean;
};

/** Morning, afternoon or evening, from the server's clock. */
function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const QUESTIONS = [
  "How are my ads doing?",
  "What should I improve?",
  "Make me another ad.",
  "Explain my results.",
  "Help me launch a campaign.",
];

export function SimpleDashboard({
  firstName,
  performance,
  campaigns,
  notices,
  anyConnected,
}: SimpleDashboardProps) {
  const t = performance.total;

  // The one derived figure on the screen, and it is derived rather than read
  // because a platform that reports spend and revenue but no ROAS is common,
  // and refusing to divide two numbers we already have would be pedantry.
  const roas =
    t.roas ??
    (t.revenueCents !== null && t.spendCents !== null && t.spendCents > 0
      ? t.revenueCents / t.spendCents
      : null);

  const results = t.purchases ?? t.conversions ?? null;

  return (
    <div className="mx-auto max-w-5xl">
      {/* ---- The statement ---- */}
      <p className="text-[13px] text-muted">
        {greeting()}
        {firstName ? `, ${firstName}` : ""}
      </p>

      <h1 className="mt-3 text-[clamp(28px,5.4vw,44px)] font-semibold leading-[1.08] tracking-[-0.03em] text-white">
        Let Mairo
        <br className="sm:hidden" />{" "}
        <span className="bg-clip-text text-transparent" style={{ backgroundImage: "var(--mairo-ramp-soft)" }}>
          run your ads.
        </span>
      </h1>

      <p className="mt-4 max-w-md text-[14px] leading-relaxed text-muted">
        Create better ads. Reach more customers. Understand what is working.
      </p>

      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <MairoButton href="/dashboard/create" className="w-full sm:w-auto">
          <span aria-hidden>+</span>
          Create new campaign
        </MairoButton>
        <MairoButton href="/dashboard/agents" tone="ghost" className="w-full sm:w-auto">
          Talk to Mairo AI
        </MairoButton>
      </div>

      {/* ---- The four numbers ---- */}
      <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <SimpleMetric label="Revenue" value={money(t.revenueCents)} technical="Tracked revenue" />
        <SimpleMetric label="Ad spend" value={money(t.spendCents)} technical="Amount spent" />
        <SimpleMetric
          label="Return"
          accent
          value={roas === null ? null : `${roas.toFixed(1)}x`}
          technical={roas === null ? undefined : `ROAS: ${roas.toFixed(2)}x`}
          explain={
            roas === null
              ? undefined
              : `For every $1 spent, your ads generated about ${money(Math.round(roas * 100))} in tracked revenue.`
          }
        />
        <SimpleMetric
          label="Results"
          value={count(results)}
          technical={results === null ? undefined : "Purchases or leads"}
        />
      </div>

      {/* ---- Campaigns ---- */}
      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.24em] text-faint">
            Your campaigns
          </h2>
          {campaigns.length > 0 && (
            <Link href="/dashboard/campaigns" className="text-[12px] text-blue-bright hover:text-white">
              View all
            </Link>
          )}
        </div>

        {campaigns.length === 0 ? (
          <GlassPanel className="p-8 text-center sm:p-10">
            <h3 className="text-[17px] font-medium text-white">No campaigns yet</h3>
            <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-muted">
              Tell Mairo what you sell and what you want to happen. It builds the campaign and brings
              it back for you to approve — nothing spends until you say so.
            </p>
            <div className="mt-6 flex justify-center">
              <MairoButton href="/dashboard/create">
                Create your first campaign
                <span aria-hidden>→</span>
              </MairoButton>
            </div>
          </GlassPanel>
        ) : (
          <ul className="space-y-3">
            {campaigns.slice(0, 3).map((c) => {
              const report = performance.campaigns.find((r) => r.mairoCampaignId === c.id);
              const m = report?.total;
              const cRoas =
                m?.roas ??
                (m && m.revenueCents !== null && m.spendCents !== null && m.spendCents > 0
                  ? m.revenueCents / m.spendCents
                  : null);
              const live = c.status === "ACTIVE";

              return (
                <li key={c.id}>
                  <MairoCard href="/dashboard/campaigns" className="p-5">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium text-white">
                          {c.name}
                        </span>
                        <span className="mt-1 flex items-center gap-2">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${live ? "bg-live" : "bg-faint"}`}
                            aria-hidden
                          />
                          <span className="text-[12px] capitalize text-muted">
                            {c.status.toLowerCase()}
                          </span>
                        </span>
                      </span>

                      <dl className="flex gap-6 sm:gap-8">
                        <div>
                          <dt className="font-mono text-[9px] uppercase tracking-[0.16em] text-faint">
                            Spent
                          </dt>
                          <dd className="mt-1 text-[14px] tabular-nums text-white">
                            {money(m?.spendCents ?? null) ?? "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-mono text-[9px] uppercase tracking-[0.16em] text-faint">
                            Generated
                          </dt>
                          <dd className="mt-1 text-[14px] tabular-nums text-white">
                            {money(m?.revenueCents ?? null) ?? "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-mono text-[9px] uppercase tracking-[0.16em] text-faint">
                            Return
                          </dt>
                          <dd className="mt-1 text-[14px] tabular-nums text-white">
                            {cRoas === null ? "—" : `${cRoas.toFixed(1)}x`}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </MairoCard>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---- Mairo AI, and what it noticed ---- */}
      <div className="mt-10 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <GlassPanel lit className="p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-medium text-white">Mairo AI</h2>
            <AIStatus label="Online" />
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            One assistant that knows your business, your campaigns and your creatives.
          </p>

          <ul className="mt-4 space-y-2">
            {QUESTIONS.map((q) => (
              <li key={q}>
                <Link
                  href={`/dashboard/agents?ask=${encodeURIComponent(q)}`}
                  className="block rounded-xl border px-4 py-2.5 text-[13px] text-muted transition-all duration-300 [transition-timing-function:var(--ease-mairo)] hover:border-[color:var(--mairo-line-lit)] hover:bg-white/[0.04] hover:text-white"
                  style={{ borderColor: "var(--mairo-line)" }}
                >
                  {q}
                </Link>
              </li>
            ))}
          </ul>

          <Link
            href="/dashboard/agents"
            className="mt-4 flex items-center gap-3 rounded-full border px-4 py-3 text-[13px] text-faint transition-colors hover:text-muted"
            style={{ borderColor: "var(--mairo-line)" }}
          >
            Ask Mairo anything…
            <span
              aria-hidden
              className="ml-auto flex h-7 w-7 items-center justify-center rounded-full text-white"
              style={{ backgroundImage: "var(--mairo-ramp)" }}
            >
              →
            </span>
          </Link>
        </GlassPanel>

        <div className="space-y-4">
          <GlassPanel className="p-5 sm:p-6">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.24em] text-faint">
              Mairo noticed
            </h2>
            {notices.length > 0 ? (
              <ul className="mt-3 space-y-3">
                {notices.slice(0, 3).map((n) => (
                  <li key={n} className="text-[13px] leading-relaxed text-muted">
                    {n}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[13px] leading-relaxed text-muted">
                {campaigns.length === 0
                  ? "Once your first campaign is running, Mairo will show what it finds here."
                  : "Your campaigns are collecting data. Mairo will show recommendations when there is enough of it to say something useful."}
              </p>
            )}
          </GlassPanel>

          <GlassPanel className="p-5 sm:p-6">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.24em] text-faint">
              Quick actions
            </h2>
            <ul className="mt-3 space-y-1">
              {[
                { href: "/dashboard/creatives", label: "Generate ad creatives" },
                { href: "/dashboard/audiences", label: "Find new audiences" },
                { href: "/dashboard/analytics", label: "Check performance" },
                ...(anyConnected
                  ? []
                  : [{ href: "/dashboard/integrations", label: "Connect an advertising account" }]),
              ].map((a) => (
                <li key={a.label}>
                  <Link
                    href={a.href}
                    className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 text-[13px] text-muted transition-colors hover:bg-white/[0.04] hover:text-white"
                  >
                    {a.label}
                    <span aria-hidden className="ml-auto text-faint">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </GlassPanel>
        </div>
      </div>

      <p className="mt-8 text-[11px] leading-relaxed text-faint">
        Figures are read from your connected advertising accounts and may lag behind the platform by
        a few hours. Mairo uses available campaign and business data to make recommendations;
        advertising results vary and cannot be guaranteed.
      </p>
    </div>
  );
}

/** Used by the page to keep the "what does this business call itself" logic in one place. */
export function firstNameFrom(name: string | null | undefined, fallback: string): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first || fallback;
}

