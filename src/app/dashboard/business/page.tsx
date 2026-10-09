import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { activeOrganizationId } from "@/lib/active-org";
import { PageHeader } from "@/components/ui";
import { loadBrain } from "@/lib/business/brain";
import { BusinessAnalyzer } from "@/components/business/analyzer-form";
import { LearningMemory } from "@/components/business/learning-memory";
import { buildCampaignFromBrainAction } from "@/lib/actions/business-actions";
import { fetchOrganizationPerformance } from "@/lib/ad-platforms/performance";
import { db } from "@/lib/db";
import { resultsFor, resultWord, usd } from "@/lib/protection/rules";

// Mairo Business Analyzer, and the Business Brain it fills.
//
// Paste the website, MAIRO reads it, and the business never types its own
// description into a campaign again. Anything the pages didn't show says "Not
// found" rather than a guess, and the whole profile can be corrected under
// Settings > Business Brain.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GOAL_LABEL: Record<string, string> = {
  SALES: "Sales",
  LEADS: "Leads",
  TRAFFIC: "Website visits",
  AWARENESS: "Awareness",
  ENGAGEMENT: "Engagement",
  APP_PROMOTION: "App installs",
};

export default async function BusinessPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const [brain, campaigns, performance, learningRows] = await Promise.all([
    loadBrain(organizationId),
    db.mairoCampaign.findMany({
      where: { organizationId, status: { not: "DRAFT" } },
      select: { id: true, name: true, objective: true },
    }),
    fetchOrganizationPerformance(organizationId).catch(() => null),
    db.mairoLearning.findMany({ where: { organizationId }, orderBy: [{ active: "desc" }, { lastSeenAt: "desc" }], take: 20 }),
  ]);
  const p = brain.profile;
  const a = brain.analysis;

  // What has worked, from real results only.
  const learned = campaigns
    .map((c) => {
      const report = performance?.campaigns.find((r) => r.mairoCampaignId === c.id);
      const results = report ? resultsFor(c.objective, report.total) : null;
      const spend = report?.total.spendCents ?? null;
      return { ...c, results, spend, cost: results && spend ? Math.round(spend / results) : null };
    })
    .filter((c) => c.results !== null && (c.spend ?? 0) > 0)
    .sort((x, y) => (x.cost ?? Infinity) - (y.cost ?? Infinity));

  return (
    <div>
      <PageHeader
        title="Mairo Business Analyzer"
        description="Paste your website and Mairo works out what you sell, who to reach and how to advertise it — then remembers it in your Business Brain, so every campaign starts from it."
        action={
          <Link href="/dashboard/settings/business-brain" className="rounded-full border px-4 py-2 text-[12.5px] text-white/85 hover:text-white" style={{ borderColor: "var(--mairo-line)" }}>
            Edit Business Brain
          </Link>
        }
      />

      <section className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--mairo-line-lit)", background: "rgba(var(--mairo-bg-rgb),0.55)" }}>
        <BusinessAnalyzer defaultUrl={brain.analyzedUrl ?? p.website} analyzed={Boolean(brain.analyzedAt)} />
        {brain.analyzedAt && (
          <p className="mt-3 text-[12px] text-faint">
            Last analyzed {brain.analyzedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            {a?.pagesRead.length ? ` · read ${a.pagesRead.length} page${a.pagesRead.length === 1 ? "" : "s"}` : ""}
          </p>
        )}
        {a?.note && <p className="mt-3 text-[12.5px] text-amber-200/90">{a.note}</p>}
      </section>

      <LearningMemory
        items={learningRows.map((l) => ({
          id: l.id,
          statement: l.statement,
          detail: l.detail,
          confidence: l.confidence,
          timesSeen: l.timesSeen,
          lastSeen: l.lastSeenAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          active: l.active,
        }))}
      />

      {!brain.analyzedAt ? (
        <p className="mt-8 max-w-2xl text-[13px] leading-relaxed text-muted">
          Nothing analyzed yet. MAIRO reads your home page and up to three of your shop, pricing or services pages. It only
          records what it actually finds there — no guessed prices, no invented offers.
        </p>
      ) : (
        <div className="mt-8 space-y-6">
          {a?.strategy && (
            <Section title="Mairo recommendation" lit>
              <div className="grid gap-4 sm:grid-cols-2">
                <Fact label="Primary product" value={a.strategy.primaryProduct} />
                <Fact label="Best audience" value={a.strategy.audience} />
                <Fact label="Strongest angle" value={a.strategy.angle} />
                <Fact label="Recommended platform" value={a.strategy.platform} />
                <Fact label="Best placements" value={a.strategy.secondaryPlatform ?? ""} />
                <Fact label="Recommended starting budget" value={`$${a.strategy.budgetPerDayDollars}/day`} note={a.strategy.budgetReason} />
                <Fact label="Recommended campaign" value={`${a.strategy.campaignLabel} (${GOAL_LABEL[a.strategy.goal] ?? a.strategy.goal})`} />
                <Fact label="Recommended creative" value={a.strategy.creative} />
              </div>
              <form action={buildCampaignFromBrainAction} className="mt-6">
                <button type="submit" className="rounded-full px-6 py-3 text-[13.5px] font-medium text-white" style={{ backgroundImage: "var(--mairo-ramp)", boxShadow: "var(--mairo-glow-key)" }}>
                  Build This Campaign
                </button>
                <p className="mt-2 text-[12px] text-faint">
                  Opens the campaign builder with all of this filled in. You check every step, and nothing launches until you say so.
                </p>
              </form>
            </Section>
          )}

          <Section title="Business overview">
            <div className="grid gap-4 sm:grid-cols-2">
              <Fact label="Business name" value={p.businessName} />
              <Fact label="Industry" value={p.industry} />
              <Fact label="What you do" value={p.overview} wide />
              <Fact label="Competitor category" value={p.competitorCategory} />
              <Fact label="Main call to action" value={p.primaryCta} />
              <Fact label="Brand style" value={p.brandStyle} />
              <Fact label="Brand voice" value={p.brandVoice} />
              <div>
                <p className="text-[11.5px] text-faint">Brand colors</p>
                {p.brandColors.length ? (
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {p.brandColors.map((c) => (
                      <span key={c} className="flex items-center gap-1.5 text-[12px] text-muted">
                        <span className="h-4 w-4 rounded-full border border-white/20" style={{ background: c }} />
                        {c}
                      </span>
                    ))}
                  </div>
                ) : (
                  <NotFound />
                )}
              </div>
            </div>
          </Section>

          <Section title="What you sell">
            {p.products.length ? (
              <ul className="divide-y" style={{ borderColor: "var(--mairo-line)" }}>
                {p.products.map((x) => (
                  <li key={x.name} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-[13px]">
                    <span className="text-white">
                      {x.name}
                      {x.category && <span className="ml-2 text-[11.5px] text-faint">{x.category}</span>}
                    </span>
                    <span className="tabular-nums text-muted">{x.price ?? "Price not shown"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <NotFound what="No products or services were listed on the pages MAIRO read." />
            )}
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <List label="Main offers" items={p.offers} />
              <List label="Discounts" items={p.discounts} />
              <Fact label="Estimated average order" value={p.averageOrderValue} note={p.averageOrderValue ? "An estimate from the prices on your site — correct it in Business Brain if it's off." : undefined} />
              <List label="Categories" items={p.categories} />
              <List label="Best products to advertise" items={p.bestProducts} />
            </div>
          </Section>

          <Section title="Who you should target">
            <Fact label="Target customer" value={p.targetCustomer} wide />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <List label="Problems they have" items={p.painPoints} />
              <List label="What they want" items={p.desires} />
            </div>
          </Section>

          <Section title="Your strongest offer">
            {a?.strongestOffer ? <Fact label={a.strongestOffer.offer} value={a.strongestOffer.why} wide /> : <NotFound what="MAIRO didn't find a clear offer on the site. A specific offer usually makes ads work harder." />}
            <div className="mt-4">
              <List label="What makes you different" items={p.usps} />
            </div>
          </Section>

          <Section title="Advertising opportunities">
            <List label="" items={p.opportunities} empty="The AI part of the analysis finds these. Run it again when it's available." />
          </Section>

          <Section title="Website conversion issues">
            {a?.conversionIssues.length ? (
              <ul className="space-y-3">
                {a.conversionIssues.map((i) => (
                  <li key={i.issue} className="rounded-xl border p-4" style={{ borderColor: i.severity === "high" ? "rgba(248,113,113,0.35)" : "var(--mairo-line)" }}>
                    <p className="text-[11px] uppercase tracking-[0.14em]" style={{ color: i.severity === "high" ? "#f87171" : i.severity === "medium" ? "#fbbf24" : "#94a3b8" }}>
                      {i.severity} impact
                    </p>
                    <p className="mt-1 text-[14px] text-white">{i.issue}</p>
                    <p className="mt-1 text-[12.5px] text-muted">{i.why}</p>
                    <p className="mt-1.5 text-[12.5px] text-white/85">
                      <span className="text-faint">Fix: </span>
                      {i.fix}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted">MAIRO didn&rsquo;t find anything on the pages it read that would stop people who arrive from an ad.</p>
            )}
          </Section>
        </div>
      )}

      <div className="mt-6">
        <Section title="What Mairo has learned from your campaigns">
          {learned.length ? (
            <ul className="space-y-2 text-[13px]">
              {learned.slice(0, 5).map((c) => (
                <li key={c.id} className="flex flex-wrap justify-between gap-2">
                  <span className="text-white">{c.name}</span>
                  <span className="text-muted">
                    {c.results} {resultWord(c.objective)}
                    {c.results === 1 ? "" : "s"}
                    {c.cost !== null ? ` at ${usd(c.cost)} each` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted">
              Nothing yet — this fills in from real results once your campaigns have run. Offers that worked or didn&rsquo;t can be noted in{" "}
              <Link href="/dashboard/settings/business-brain" className="text-blue-bright hover:text-white">Business Brain</Link>.
            </p>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children, lit = false }: { title: string; children: ReactNode; lit?: boolean }) {
  return (
    <section className="rounded-2xl border p-5 sm:p-6" style={{ borderColor: lit ? "var(--mairo-line-lit)" : "var(--mairo-line)", background: "rgba(var(--mairo-bg-rgb),0.45)" }}>
      <h2 className="mb-4 font-mono text-[10.5px] uppercase tracking-[0.18em] text-blue-bright">{title}</h2>
      {children}
    </section>
  );
}

function NotFound({ what = "Not found on your site" }: { what?: string }) {
  return <p className="mt-0.5 text-[13px] italic text-faint">{what}</p>;
}

function Fact({ label, value, note, wide = false }: { label: string; value: string; note?: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <p className="text-[11.5px] text-faint">{label}</p>
      {value.trim() ? <p className="mt-0.5 text-[13.5px] leading-relaxed text-white">{value}</p> : <NotFound />}
      {note && <p className="mt-1 text-[11.5px] text-muted">{note}</p>}
    </div>
  );
}

function List({ label, items, empty }: { label: string; items: string[]; empty?: string }) {
  return (
    <div>
      {label && <p className="text-[11.5px] text-faint">{label}</p>}
      {items.length ? (
        <ul className="mt-1 space-y-1 text-[13px] text-white">
          {items.map((i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="text-blue-bright">·</span>
              {i}
            </li>
          ))}
        </ul>
      ) : (
        <NotFound what={empty} />
      )}
    </div>
  );
}
