import { db } from "@/lib/db";
import Link from "next/link";
import { Card, Badge } from "@/components/ui";
import { metaIntelligenceSummary } from "@/lib/meta-intelligence";
import { heroFunnel, retention, stepFunnel } from "@/lib/analytics/funnel";
import { staffUser } from "@/lib/aios/workspace";
import { loadFounderSignals } from "@/lib/aios/signals";
import { coreState, founderBrief, money, type Tone } from "@/lib/aios/brief";
import { AiCore, CORE_LABEL } from "@/components/aios/ai-core";
import { Sparkline } from "@/components/viz/sparkline";
import { Reveal } from "@/components/viz/motion";

// The Founder Command Center: the state of the platform from its own records
// — subscriptions and Stripe-collected revenue, sign-ups, Meta, background
// jobs, alerts, approvals waiting on customers, support — the briefing built
// from them, and the founder's own work. Owner-only (app/aios/layout.tsx, and
// every action re-checks). A source that can't be read says so.

export const dynamic = "force-dynamic";
export const metadata = { title: "Command Center" };

const eyebrow = "text-[11px] font-semibold uppercase tracking-[0.18em] text-signal";
const DOT: Record<Tone, string> = { alert: "bg-red-400", attention: "bg-amber-300", info: "bg-signal", good: "bg-emerald-400" };

function Stat({ label, value, note, source, href, children }: { label: string; value: string; note?: string; source: string; href?: string; children?: React.ReactNode }) {
  const body = (
    <div className="flex h-full flex-col rounded-2xl border border-[color:var(--mairo-line)] bg-[rgba(var(--mairo-fg-rgb),0.02)] p-4 transition hover:border-[color:var(--mairo-line-lit)]">
      <p className="text-[12.5px] text-neutral-400">{label}</p>
      <p className="mt-1.5 text-[24px] font-medium tabular-nums tracking-[-0.01em] text-white">{value}</p>
      {note && <p className="mt-0.5 text-[12px] text-neutral-500">{note}</p>}
      {children && <div className="mt-2">{children}</div>}
      <p className="mt-auto pt-3 text-[10px] uppercase tracking-[0.14em] text-neutral-500">{source}</p>
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

function greeting(now: Date) {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function CommandCenterPage() {
  const now = new Date();
  const [me, s, nextTasks] = await Promise.all([
    staffUser(),
    loadFounderSignals(now),
    db.founderItem.findMany({ where: { kind: { in: ["TASK", "MILESTONE"] }, doneAt: null }, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }], take: 5, include: { project: { select: { id: true, name: true } } } }),
  ]);
  const brief = founderBrief(s);
  const state = coreState(brief);
  const first = me?.name?.split(" ")[0];
  const rev = s.revenue;

  return (
    <div className="mx-auto max-w-[1240px] space-y-10">
      <Reveal>
        <section aria-labelledby="brief-title" className="relative overflow-hidden rounded-[28px] border border-[color:var(--mairo-line)] p-6 sm:p-8" style={{ background: "radial-gradient(120% 140% at 0% 0%, rgba(45,212,191,0.10), transparent 55%), rgba(var(--mairo-fg-rgb),0.015)" }}>
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
            <div className="flex items-center gap-5 lg:w-[300px] lg:flex-col lg:items-start">
              <AiCore state={state} />
              <div>
                <p className={eyebrow}>AIOS · Command Center</p>
                <h1 className="mt-2 text-[clamp(24px,3vw,32px)] font-semibold tracking-[-0.02em] text-white">{greeting(now)}{first ? `, ${first}` : ""}.</h1>
                <p className="mt-1 text-[14px] text-neutral-400">{CORE_LABEL[state]} · {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href="/aios/copilot" className="rounded-full bg-[image:var(--mairo-ramp)] px-4 py-2 text-[13px] font-medium shadow-[var(--mairo-glow-key)]">Ask JARVIS</Link>
                  <Link href="/aios/projects" className="rounded-full border border-[color:var(--mairo-line-lit)] px-4 py-2 text-[13px] text-white">Projects</Link>
                </div>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="brief-title" className={eyebrow}>Today&rsquo;s briefing</h2>
              <ul className="mt-3 divide-y divide-[color:var(--mairo-line)]">
                {brief.map((l, i) => (
                  <li key={i}>
                    <Link href={l.href} className="group flex items-start gap-3 py-3">
                      <span aria-hidden className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${DOT[l.tone]}`} />
                      <span className="min-w-0 flex-1 text-[14.5px] leading-snug text-white">
                        <span className="sr-only">{l.tone === "alert" ? "Failing: " : l.tone === "attention" ? "Needs a look: " : ""}</span>
                        {l.text}
                      </span>
                      <span className="hidden shrink-0 rounded-full border border-[color:var(--mairo-line)] px-2 py-0.5 text-[10.5px] text-neutral-500 sm:inline">{l.source}</span>
                      <span aria-hidden className="text-neutral-500 transition group-hover:translate-x-0.5 group-hover:text-white">→</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11.5px] text-neutral-500">Built from MAIRO&rsquo;s records as this page loaded — nothing here is estimated unless it says so.</p>
            </div>
          </div>
        </section>
      </Reveal>

      <section aria-labelledby="business-title">
        <h2 id="business-title" className={eyebrow}>The business</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Stat label="On a paid plan or trial" value={String(s.subscriptions.entitled)} note={`${s.subscriptions.trialing} trialing · ${s.subscriptions.pastDue} past due`} source="Stripe (webhook)" href="/aios/billing" />
          <Stat
            label="Collected, last 30 days"
            value={rev.state === "verified" ? money(rev.cents, rev.currency) : rev.state === "not_configured" ? "Not set up" : "Couldn't read"}
            note={rev.state === "verified" ? `${rev.invoices} paid invoice${rev.invoices === 1 ? "" : "s"}${s.stripe.mode === "test" ? " · test mode" : ""}` : rev.state === "error" ? rev.message : "Stripe isn't configured here"}
            source="Stripe invoices"
            href="/aios/billing"
          />
          <Stat label="Monthly at list price" value={money(s.subscriptions.listMrrCents)} note="Estimate: active plans × list price, before discounts and tax" source="Plan prices" href="/aios/billing" />
          <Stat label="New accounts, 7 days" value={String(s.signups.users7)} note={`${s.signups.users30} in 30 days · ${s.signups.businesses7} new businesses`} source="Sign-ups" href="/aios/organizations">
            <Sparkline points={s.signups.daily} width={160} height={30} label="New accounts per day, last 14 days" />
          </Stat>
          <Stat label="Cancelled, 30 days" value={String(s.subscriptions.canceled30)} note={`${s.subscriptions.incomplete} checkouts incomplete`} source="Stripe (webhook)" href="/aios/billing" />
        </div>
      </section>

      <section aria-labelledby="systems-title">
        <h2 id="systems-title" className={eyebrow}>Systems</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Stat label="Meta connections" value={String(s.meta.connected)} note={s.meta.needsReconnect ? `${s.meta.needsReconnect} need reconnecting` : "None need reconnecting"} source="Meta connections" href="/aios/customers" />
          <Stat label="Meta operations" value={s.meta.operations.some((o) => o.state === "paused") ? "Paused" : s.meta.operations.some((o) => o.state === "investigate") ? "Investigate" : s.meta.operations.length ? "Healthy" : "No writes yet"} note={`${s.meta.apiErrors24h} distinct API errors in 24h`} source="Meta operation stats" href="/aios/meta-intelligence?tab=errors" />
          <Stat label="Background runs, 24h" value={String(s.jobs.done24h)} note={`${s.jobs.failed24h} failed · ${s.jobs.stuck} stuck${s.jobs.lastFinishedAt ? ` · last ${s.jobs.lastFinishedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}`} source="Agent runs" href="/aios/operations" />
          <Stat label="Alerts unread" value={String(s.alerts.unread)} note={s.alerts.critical ? `${s.alerts.critical} critical` : "None critical"} source="Platform alerts" href="/aios/meta-intelligence" />
          <Stat label="AI usage and cost" value="Not measured" note="MAIRO doesn't record model usage per request yet, so there's nothing true to show." source="—" />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="customers-title" className="rounded-[24px] border border-[color:var(--mairo-line)] p-5">
          <h2 id="customers-title" className={eyebrow}>Waiting on customers and support</h2>
          <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div><dt className="text-[12px] text-neutral-400">Decisions</dt><dd className="mt-1 text-[22px] tabular-nums text-white">{s.approvals.pending}</dd></div>
            <div><dt className="text-[12px] text-neutral-400">Urgent</dt><dd className="mt-1 text-[22px] tabular-nums text-white">{s.approvals.urgent}</dd></div>
            <div><dt className="text-[12px] text-neutral-400">Feedback open</dt><dd className="mt-1 text-[22px] tabular-nums text-white">{s.support.open + s.support.inProgress}</dd></div>
          </dl>
          <p className="mt-4 text-[12.5px] text-neutral-500">Decisions are the customers&rsquo; to approve — AIOS shows them, it doesn&rsquo;t approve for anyone.</p>
          <div className="mt-1 flex gap-4 text-[13px]">
            <Link href="/aios/operations" className="inline-flex min-h-11 items-center text-signal hover:underline">Operations →</Link>
            <Link href="/aios/customers" className="inline-flex min-h-11 items-center text-signal hover:underline">Customers →</Link>
          </div>
        </section>
        <section aria-labelledby="work-title" className="rounded-[24px] border border-[color:var(--mairo-line)] p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="work-title" className={eyebrow}>Your work</h2>
            <p className="text-[12px] text-neutral-500">{s.work.activeProjects} active project{s.work.activeProjects === 1 ? "" : "s"} · {s.work.openTasks} open · {s.work.overdue} overdue</p>
          </div>
          {nextTasks.length === 0 ? (
            <p className="mt-4 text-[14px] text-neutral-400">No open tasks. <Link href="/aios/projects" className="text-signal hover:underline">Add one</Link> or ask JARVIS to.</p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {nextTasks.map((t) => {
                const late = t.dueAt && t.dueAt < new Date(now.toDateString());
                return (
                  <li key={t.id}>
                    <Link href={t.project ? `/aios/projects/${t.project.id}` : "/aios/projects"} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-[rgba(var(--mairo-fg-rgb),0.04)]">
                      <span aria-hidden className={`h-3.5 w-3.5 shrink-0 rounded-[5px] border ${t.kind === "MILESTONE" ? "rotate-45 border-signal" : "border-neutral-500"}`} />
                      <span className="min-w-0 flex-1 truncate text-[14px] text-white">{t.title}</span>
                      <span className="shrink-0 text-[12px] text-neutral-500">{t.project?.name ?? "Inbox"}</span>
                      {t.dueAt && <span className={`shrink-0 text-[12px] tabular-nums ${late ? "text-amber-300" : "text-neutral-400"}`}>{t.dueAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {s.subscriptions.byTier.length > 0 && (
        <section aria-labelledby="plans-title">
          <h2 id="plans-title" className={eyebrow}>By plan</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {s.subscriptions.byTier.map((t) => (
              <li key={t.tier} className="rounded-full border border-[color:var(--mairo-line)] px-3 py-1.5 text-[13px] text-white">
                {t.label} <span className="ml-1 tabular-nums text-neutral-400">{t.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <GrowthSection />
    </div>
  );
}

async function GrowthSection() {
  const [orgCount, campaignCount, activeCampaigns, pendingCreatives, connectedMeta] =
    await Promise.all([
      db.organization.count(),
      db.campaign.count(),
      db.campaign.count({ where: { status: "ACTIVE" } }),
      db.creativeRequest.count({ where: { status: { in: ["REQUESTED", "IN_PROGRESS"] } } }),
      db.metaAdAccount.count({ where: { status: "CONNECTED" } }),
    ]);

  const metaIntel = await metaIntelligenceSummary().catch(() => null);
  const heroes = await heroFunnel(30).catch(() => []);
  const [steps, kept] = await Promise.all([stepFunnel(30).catch(() => []), retention(30).catch(() => null)]);

  const recentOrgs = await db.organization.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { intake: true, metaAdAccount: true },
  });

  return (
    <div>
      <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-signal">Growth</h2>
      <div className="grid gap-6 sm:grid-cols-4">
        <Card>
          <p className="text-sm text-neutral-400">Organizations</p>
          <p className="mt-2 text-2xl font-semibold">{orgCount}</p>
        </Card>
        <Card>
          <p className="text-sm text-neutral-400">Campaigns (active)</p>
          <p className="mt-2 text-2xl font-semibold">
            {activeCampaigns} <span className="text-base text-neutral-500">/ {campaignCount}</span>
          </p>
        </Card>
        <Card>
          <p className="text-sm text-neutral-400">Meta accounts connected</p>
          <p className="mt-2 text-2xl font-semibold">{connectedMeta}</p>
        </Card>
        <Card>
          <p className="text-sm text-neutral-400">Creative requests open</p>
          <p className="mt-2 text-2xl font-semibold">{pendingCreatives}</p>
        </Card>
      </div>

      <Card className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm text-neutral-400">Landing page versions · last 30 days</p>
          <p className="text-xs text-neutral-500">Plans created per landing view is the measure that decides. Views count once per visitor per day.</p>
        </div>
        {heroes.length ? (
          <table className="mt-3 w-full text-left text-[13.5px]">
            <thead className="text-neutral-400">
              <tr>
                <th className="py-1 font-normal">Version</th>
                <th className="py-1 font-normal">Views</th>
                <th className="py-1 font-normal">Previews started</th>
                <th className="py-1 font-normal">Previews finished</th>
                <th className="py-1 font-normal">Plans created</th>
                <th className="py-1 font-normal">Plans per view</th>
              </tr>
            </thead>
            <tbody>
              {heroes.map((h) => (
                <tr key={h.variant} className="border-t border-white/10">
                  <td className="py-1.5">{h.variant === "story" ? "Story hero (new)" : "Previous page"}</td>
                  <td className="py-1.5 tabular-nums">{h.views}</td>
                  <td className="py-1.5 tabular-nums">{h.previewStarts}</td>
                  <td className="py-1.5 tabular-nums">{h.previewCompletes}</td>
                  <td className="py-1.5 tabular-nums">{h.plansCreated}</td>
                  <td className="py-1.5 tabular-nums">{h.planRate === null ? "—" : `${(h.planRate * 100).toFixed(1)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-2 text-[13.5px] text-neutral-400">No landing visits recorded yet.</p>
        )}
        <p className="mt-2 text-xs text-neutral-500">Too few plans to call a winner until each version has a few dozen. The previous page has no preview, so its preview columns stay at zero.</p>
      </Card>

      <Card className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm text-neutral-400">The funnel · last 30 days</p>
          <p className="text-xs text-neutral-500">Counts only — no names or details. Landing and free-plan steps are per visitor; the rest once per business.</p>
        </div>
        {steps.length ? (
          <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s) => (
              <li key={s.name} className="rounded-xl border border-white/10 px-3 py-2">
                <p className="text-[12px] text-neutral-400">{s.label}</p>
                <p className="mt-0.5 text-[18px] tabular-nums text-white">{s.count}</p>
                <p className="text-[11.5px] text-neutral-500">{s.fromPrevious === null ? "—" : `${(s.fromPrevious * 100).toFixed(0)}% of the step before`}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-[13.5px] text-neutral-400">Nothing recorded yet.</p>
        )}
        <p className="mt-3 text-[13px] text-neutral-300">
          {kept && kept.eligible > 0
            ? `Still subscribed: ${kept.retained} of the ${kept.eligible} businesses that subscribed at least ${kept.afterDays} days ago (${((kept.rate ?? 0) * 100).toFixed(0)}%).`
            : `Still subscribed after ${kept?.afterDays ?? 30} days: no business subscribed that long ago yet.`}
        </p>
        <p className="mt-1 text-xs text-neutral-500">Steps a business took before these events were recorded aren&apos;t counted, so early numbers undercount.</p>
      </Card>

      {metaIntel && (
        <Link href="/aios/meta-intelligence" className="mt-6 block">
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-neutral-400">Meta Intelligence</p>
              <p className="mt-1 text-[15px] text-white">{metaIntel.open} open Meta updates · {metaIntel.alerts} unread alerts</p>
            </div>
            {metaIntel.critical > 0 ? <Badge tone="red">{metaIntel.critical} critical</Badge> : <Badge tone="green">No critical updates</Badge>}
          </Card>
        </Link>
      )}

      <div className="mt-8">
        <h2 className="mb-4 font-medium">Newest organizations</h2>
        <div className="space-y-3">
          {recentOrgs.map((org) => (
            <Card key={org.id} className="flex items-center justify-between">
              <div>
                <p className="font-medium">{org.name}</p>
                <p className="text-sm text-neutral-500">
                  {org.intake ? org.intake.primaryGoal : "Onboarding incomplete"}
                </p>
              </div>
              <Badge tone={org.metaAdAccount ? "green" : "red"}>
                {org.metaAdAccount ? "Meta connected" : "Not connected"}
              </Badge>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
