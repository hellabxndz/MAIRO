"use client";

import Link from "next/link";
import { useState, type ReactNode, type RefObject } from "react";
import type { PlanReport } from "@/lib/preview/report";
import type { PreviewGoal } from "@/lib/preview/build";
import { BUDGET_CHOICES, GOAL_OPTIONS, budgetLabel } from "@/lib/preview/strategy";
import { PLANS, STARTER_TRIAL_DAYS } from "@/lib/plans";
import { AdMock, type Placement } from "./ad-mock";

// The free AI ad plan, sections A to F, then the step from the free plan to
// MAIRO doing the work. Live (just generated) it carries the return actions —
// edit, change the budget, try another goal, save, share, download; shared
// (a link someone sent) it's read-only with a way to build your own.
//
// What each statement is stays visible: the business's facts say where they
// came from, MAIRO's suggestions say they're suggestions, what the website
// reading saw is reported as seen, and planned work is labelled as planned.

export type SaveState = { status: "idle" | "saving" | "saved" | "error"; token?: string; message?: string; toAccount?: boolean; next?: string };

export type ReportActions = {
  onEdit: () => void;
  onBudget: (monthly: number) => void;
  onGoal: (goal: PreviewGoal) => void;
  onSave: () => void;
  onShare: () => void;
  onWork: () => void;
  /** Already a customer: save, sign in, and the plan joins their business. */
  onSignIn: () => void;
  save: SaveState;
  working: boolean;
  shareNote: string | null;
};

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const cap = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
const domainOf = (url: string | null) => (url ? url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "") : null);

const SECTIONS = [
  { id: "plan-business", letter: "A", title: "Your business, understood" },
  { id: "plan-strategy", letter: "B", title: "Recommended Meta strategy" },
  { id: "plan-budget", letter: "C", title: "Monthly budget plan" },
  { id: "plan-concepts", letter: "D", title: "Three AI ad concepts" },
  { id: "plan-website", letter: "E", title: "Website & opportunities" },
  { id: "plan-month", letter: "F", title: "Your first 30 days with MAIRO" },
] as const;

function SourceChip({ from }: { from: "website" | "you" | "suggestion" }) {
  if (from === "website") return <span className="shrink-0 rounded-full bg-emerald-400/12 px-2 py-0.5 text-[10.5px] font-medium normal-case tracking-normal text-emerald-300">From your website</span>;
  if (from === "you") return <span className="shrink-0 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10.5px] font-medium normal-case tracking-normal text-violet-200">You told MAIRO</span>;
  return <span className="shrink-0 rounded-full bg-amber-300/12 px-2 py-0.5 text-[10.5px] font-medium normal-case tracking-normal text-amber-200">MAIRO&rsquo;s suggestion</span>;
}

function Section({ id, letter, title, intro, children }: { id: string; letter: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="mp-section scroll-mt-24 rounded-[28px] border p-5 sm:p-8" style={{ borderColor: "var(--mairo-line)", backgroundImage: "var(--mairo-glass)", boxShadow: "var(--mairo-glow-soft)" }}>
      <div className="flex items-start gap-3.5">
        <span aria-hidden className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-violet-400/30 bg-violet-500/[0.12] font-mono text-[13px] font-semibold text-violet-200">{letter}</span>
        <div className="min-w-0">
          <h2 id={`${id}-h`} className="text-[21px] font-semibold leading-tight tracking-[-0.02em] text-white sm:text-[24px]">{title}</h2>
          {intro && <p className="mt-1.5 max-w-[760px] text-[14px] leading-relaxed text-white/65">{intro}</p>}
        </div>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Tile({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`min-w-0 rounded-2xl border p-4 ${wide ? "sm:col-span-2" : ""}`} style={{ borderColor: "var(--mairo-line)", background: "rgba(var(--mairo-fg-rgb),0.02)" }}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">{label}</p>
      <div className="mt-1.5 text-[14.5px] leading-snug text-white">{children}</div>
    </div>
  );
}

function Bullets({ items, tone = "violet" }: { items: string[]; tone?: "violet" | "emerald" | "amber" }) {
  const dot = tone === "emerald" ? "bg-emerald-300" : tone === "amber" ? "bg-amber-300" : "bg-violet-300";
  return (
    <ul className="space-y-2">
      {items.map((t) => (
        <li key={t} className="flex gap-2.5 text-[14px] leading-relaxed text-white/80">
          <span aria-hidden className={`mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
          <span className="min-w-0">{t}</span>
        </li>
      ))}
    </ul>
  );
}

const SEGMENT = ["#2f6bff", "#38bdf8", "#a9c8ff", "#5fd4c4"];

function sourceNote(r: PlanReport): { title: string; body: string; tone: "ai" | "templates" | "fixture" } {
  const s = r.concepts.source;
  const filled = r.concepts.filled;
  const dropped = r.concepts.dropped.length;
  if (s.by === "ai") {
    return {
      title: "Written by MAIRO's AI for your business",
      body: `From the facts in section A only, then checked by MAIRO before you saw it${dropped ? ` — ${dropped} thing${dropped === 1 ? " was" : "s were"} taken out because ${dropped === 1 ? "it wasn't" : "they weren't"} supported by your facts` : ""}${filled ? `, and ${filled} concept${filled === 1 ? "" : "s"} came from MAIRO's ad templates instead` : ""}.`,
      tone: "ai",
    };
  }
  if (s.by === "fixture") return { title: "Local test fixture — not MAIRO's AI", body: s.note, tone: "fixture" };
  const why =
    s.why === "limit"
      ? "You've generated several AI plans this hour, so this one uses MAIRO's ad templates."
      : s.why === "budget"
        ? "MAIRO's AI has written today's limit of free plans, so this one uses MAIRO's ad templates."
        : s.why === "failed"
          ? "MAIRO's AI didn't answer this time, so these come from MAIRO's ad templates. Generate again to retry."
          : "MAIRO's AI writing isn't switched on here, so these come from MAIRO's ad templates.";
  return { title: "Written from MAIRO's ad templates", body: `${why} They use only the facts in section A — nothing is invented.`, tone: "templates" };
}

export function PlanReportView({ report: r, actions, headingRef, savedAt }: { report: PlanReport; actions: ReportActions | null; headingRef?: RefObject<HTMLHeadingElement | null>; savedAt?: string }) {
  const [placement, setPlacement] = useState<Placement>("facebook");
  const domain = domainOf(r.website.url);
  const note = sourceNote(r);
  const starter = PLANS[0];

  return (
    <article aria-labelledby="plan-title" className="mx-auto max-w-[1180px]">
      {/* The plan's header and its return actions. */}
      <header className="mp-head">
        <p className="inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/[0.10] px-3 py-1 text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-200">
          <span aria-hidden>✨</span> Your free AI ad plan
        </p>
        <h1 id="plan-title" ref={headingRef} tabIndex={-1} className="mt-4 text-[clamp(30px,5vw,54px)] font-semibold leading-[1.02] tracking-[-0.04em] text-white outline-none [text-wrap:balance]">
          {r.name}&rsquo;s Meta advertising strategy
        </h1>
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[14.5px] text-white/70">
          <span>{r.goalLabel}</span>
          <span aria-hidden className="text-white/25">•</span>
          <span>{budgetLabel(r.budget.monthly)} a month on Meta ads</span>
          <span aria-hidden className="text-white/25">•</span>
          <span>Facebook &amp; Instagram</span>
          {savedAt && (
            <>
              <span aria-hidden className="text-white/25">•</span>
              <span>Made {new Date(savedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
            </>
          )}
        </p>

        {actions && <ActionBar r={r} a={actions} />}

        <nav aria-label="Plan sections" className="mp-noprint -mx-1 mt-6 flex gap-2 overflow-x-auto px-1 pb-1">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12.5px] text-white/70 transition hover:border-violet-400/50 hover:text-white">
              <span className="font-mono text-violet-300">{s.letter}</span> {s.title}
            </a>
          ))}
        </nav>
      </header>

      <div className="mt-8 space-y-5">
        {/* A */}
        <Section id="plan-business" letter="A" title="Your business, understood" intro={<>What MAIRO knows, and where each fact came from — kept apart from what MAIRO suggests.</>}>
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-white/55">The facts</h3>
              <dl className="mt-3 divide-y divide-white/[0.06] rounded-2xl border" style={{ borderColor: "var(--mairo-line)" }}>
                {r.business.facts.map((f) => (
                  <div key={f.key} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                    <dt className="w-[150px] shrink-0 text-[12.5px] text-white/50">{f.label}</dt>
                    <dd className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-2">
                      <span className="min-w-0 break-words text-[14px] text-white">{f.value}</span>
                      <SourceChip from={f.from} />
                    </dd>
                  </div>
                ))}
                <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                  <dt className="w-[150px] shrink-0 text-[12.5px] text-white/50">Likely customers</dt>
                  <dd className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-2">
                    <span className="min-w-0 break-words text-[14px] text-white">{cap(r.business.customers.text)}</span>
                    <SourceChip from={r.business.customers.from} />
                  </dd>
                </div>
              </dl>
              {r.business.assumptions.length > 0 && (
                <div className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-300/[0.05] px-4 py-3">
                  <p className="text-[12.5px] font-semibold text-amber-200">What MAIRO assumed</p>
                  <ul className="mt-1 space-y-1 text-[13px] leading-relaxed text-white/70">
                    {r.business.assumptions.map((a) => <li key={a}>{a}</li>)}
                  </ul>
                </div>
              )}
            </div>
            <div className="min-w-0 space-y-5">
              <div>
                <h3 className="flex flex-wrap items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-white/55">
                  What makes it appealing <SourceChip from="suggestion" />
                </h3>
                <div className="mt-3"><Bullets items={r.business.appeal} /></div>
              </div>
              <div>
                <h3 className="flex flex-wrap items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-white/55">
                  Advertising opportunities <SourceChip from="suggestion" />
                </h3>
                <ul className="mt-3 grid gap-2.5">
                  {r.business.opportunities.map((o) => (
                    <li key={o.title} className="rounded-2xl border px-4 py-3" style={{ borderColor: "var(--mairo-line)", background: "rgba(var(--mairo-fg-rgb),0.02)" }}>
                      <p className="text-[14px] font-semibold text-white">{o.title}</p>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-white/65">{o.detail}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </Section>

        {/* B */}
        <Section id="plan-strategy" letter="B" title="Recommended Meta strategy" intro={<>How MAIRO would set up your first campaign on Facebook and Instagram for &ldquo;{r.goalLabel.toLowerCase()}&rdquo; — and why.</>}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Tile label="Campaign objective">{r.strategy.objective}</Tile>
            <Tile label="Meta optimises for">{r.strategy.optimiseFor}</Tile>
            <Tile label="People go to"><span className="break-words">{r.strategy.destination}</span></Tile>
            <Tile label="Audience" wide>{r.strategy.audience}</Tile>
            <Tile label="Placements">
              <span className="flex flex-wrap gap-1.5">
                {r.strategy.placements.map((p) => <span key={p} className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[12.5px] text-white/85">{p}</span>)}
              </span>
            </Tile>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-white/60">{r.strategy.placementsWhy}</p>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-white/55">What the ads should say</h3>
              <div className="mt-3"><Bullets items={r.strategy.messaging} /></div>
            </div>
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-white/55">Campaign structure</h3>
              <ol className="mt-3 space-y-2">
                {r.strategy.structure.map((s, i) => (
                  <li key={s} className="flex gap-3 text-[14px] leading-relaxed text-white/80">
                    <span aria-hidden className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.06] font-mono text-[10.5px] text-white/60">{i + 1}</span>
                    <span className="min-w-0 break-words">{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {r.strategy.why.map((w) => (
              <div key={w.title} className="rounded-2xl border px-4 py-3.5" style={{ borderColor: "var(--mairo-line)" }}>
                <p className="text-[13.5px] font-semibold text-white">{w.title}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-white/65">{w.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[12.5px] text-white/50">{r.strategy.learning}</p>
        </Section>

        {/* C */}
        <Section id="plan-budget" letter="C" title="Monthly budget plan" intro={<>Your {budgetLabel(r.budget.monthly)} divided for this goal. It&rsquo;s what you&rsquo;d pay Meta for ads from your own ad account — not MAIRO&rsquo;s subscription — and it&rsquo;s a recommendation, not a forecast of results.</>}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[40px] font-semibold leading-none tracking-[-0.03em] text-white">{money(r.budget.monthly)}<span className="text-[16px] font-normal text-white/50"> a month</span></p>
              <p className="mt-1.5 text-[14px] text-white/65">About {money(r.budget.daily)} a day · {r.budget.adsAtOnce === 1 ? "one ad" : `${r.budget.adsAtOnce} ads`} at a time to start</p>
            </div>
            {actions && (
              <div className="mp-noprint">
                <p className="text-[12px] text-white/50">Change your budget</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {BUDGET_CHOICES.map((b) => (
                    <button key={b} type="button" onClick={() => actions.onBudget(b)} aria-pressed={r.budget.monthly === b} className={`min-h-[36px] rounded-full border px-3 text-[13px] transition ${r.budget.monthly === b ? "border-violet-400/70 bg-violet-500/20 text-white" : "border-white/12 text-white/75 hover:border-white/30 hover:text-white"}`}>
                      {budgetLabel(b)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div aria-hidden className="mt-5 flex h-3 overflow-hidden rounded-full bg-white/[0.06]">
            {r.budget.lines.map((l, i) => <span key={l.key} style={{ width: `${l.share}%`, background: SEGMENT[i % SEGMENT.length] }} className="h-full first:rounded-l-full last:rounded-r-full" />)}
          </div>
          <ul className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {r.budget.lines.map((l, i) => (
              <li key={l.key} className="rounded-2xl border p-4" style={{ borderColor: "var(--mairo-line)", background: "rgba(var(--mairo-fg-rgb),0.02)" }}>
                <p className="flex items-center gap-2 text-[13px] font-semibold text-white">
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: SEGMENT[i % SEGMENT.length] }} />
                  {l.label}
                  <span className="ml-auto font-normal text-white/50">{l.share}%</span>
                </p>
                <p className="mt-2 text-[24px] font-semibold tracking-[-0.02em] text-white">{money(l.monthly)}<span className="text-[13px] font-normal text-white/50"> /month · about {money(l.daily)}/day</span></p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/65">{l.why}</p>
              </li>
            ))}
          </ul>
          {r.budget.notes.length > 0 && (
            <div className="mt-4 rounded-2xl border px-4 py-3" style={{ borderColor: "var(--mairo-line)" }}>
              <Bullets items={r.budget.notes} tone="amber" />
            </div>
          )}
          <p className="mt-4 text-[12.5px] leading-relaxed text-white/50">Nothing is spent until you approve a campaign and its daily budget in MAIRO, and MAIRO never raises a budget on its own. These figures say how the money would be divided — not how many results it will bring.</p>
        </Section>

        {/* D */}
        <Section id="plan-concepts" letter="D" title="Three AI ad concepts" intro={<>Three different openings for your first ads, shown as they&rsquo;d sit in the feed. They&rsquo;re concepts: where the picture goes, MAIRO describes what to show.</>}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className={`max-w-[720px] rounded-2xl border px-4 py-3 ${note.tone === "ai" ? "border-violet-400/25 bg-violet-500/[0.07]" : "border-amber-300/25 bg-amber-300/[0.06]"}`}>
              <p className="text-[13px] font-semibold text-white">{note.title}</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-white/65">{note.body}</p>
            </div>
            <div role="radiogroup" aria-label="Show the ads as on" className="mp-noprint flex rounded-full border border-white/12 bg-white/[0.03] p-1">
              {(["facebook", "instagram"] as const).map((p) => (
                <button key={p} type="button" role="radio" aria-checked={placement === p} onClick={() => setPlacement(p)} className={`min-h-[34px] rounded-full px-3.5 text-[13px] font-medium transition ${placement === p ? "bg-white text-[#111]" : "text-white/70 hover:text-white"}`}>
                  {p === "facebook" ? "Facebook" : "Instagram"}
                </button>
              ))}
            </div>
          </div>
          <ol className="mt-5 grid gap-5 lg:grid-cols-3">
            {r.concepts.list.map((c, i) => {
              const first = i === r.concepts.first;
              return (
                <li key={`${c.headline}-${i}`} className={`flex min-w-0 flex-col rounded-[24px] border p-3 ${first ? "border-violet-400/60 bg-violet-500/[0.06] shadow-[var(--mairo-glow-key)]" : ""}`} style={first ? undefined : { borderColor: "var(--mairo-line)" }}>
                  <div className="flex items-center justify-between gap-2 px-1.5 pb-2.5 pt-1">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/55">Concept {i + 1} · {c.label}</p>
                    {first && <span className="rounded-full bg-[image:var(--mairo-ramp)] px-2.5 py-0.5 text-[11px] font-semibold text-white">Test first</span>}
                  </div>
                  <AdMock c={c} business={r.name} placement={placement} domain={domain} />
                  {first && (
                    <p className="mt-3 rounded-2xl border border-violet-400/30 bg-violet-500/[0.10] px-3.5 py-2.5 text-[13px] leading-relaxed text-white">
                      <strong className="font-semibold">MAIRO recommends testing this one first.</strong> {r.concepts.firstWhy}
                    </p>
                  )}
                  <dl className="mt-3 grid gap-2 px-1.5 pb-1 text-[13px]">
                    <div><dt className="inline text-white/45">Headline: </dt><dd className="inline text-white/85">{c.headline}</dd></div>
                    <div><dt className="inline text-white/45">Format: </dt><dd className="inline text-white/85">{c.format}</dd></div>
                    <div><dt className="inline text-white/45">Button: </dt><dd className="inline text-white/85">{c.cta}</dd></div>
                    <div><dt className="inline text-white/45">For: </dt><dd className="inline text-white/85">{cap(c.targetCustomer)}</dd></div>
                    <div><dt className="inline text-white/45">Why: </dt><dd className="inline text-white/70">{c.why}</dd></div>
                  </dl>
                </li>
              );
            })}
          </ol>
          <p className="mt-4 text-[12.5px] leading-relaxed text-white/50">No picture or video has been made for these yet. With a subscription, MAIRO turns the concept you choose into a finished ad — from your own photos and videos, or AI pictures from your plan&rsquo;s image credits — for you to approve.</p>
        </Section>

        {/* E */}
        <Section id="plan-website" letter="E" title="Website & opportunities" intro={r.website.read ? <>What MAIRO&rsquo;s reading of {domain} actually saw — the public pages only — and what to change before you spend.</> : <>MAIRO didn&rsquo;t read a website for this plan, so it makes no claims about one.</>}>
          {r.website.read ? (
            <>
              <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {r.website.seen.map((s) => (
                  <li key={s.label} className="flex items-center justify-between gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: "var(--mairo-line)" }}>
                    <span className="text-[13px] text-white/55">{s.label}</span>
                    <span className={`text-right text-[13.5px] font-medium ${s.ok === true ? "text-emerald-300" : s.ok === false ? "text-amber-200" : "text-white"}`}>{s.value}</span>
                  </li>
                ))}
              </ul>
              {r.website.findings.length > 0 ? (
                <ul className="mt-5 grid gap-3 lg:grid-cols-2">
                  {r.website.findings.map((f) => (
                    <li key={f.title} className="rounded-2xl border p-4" style={{ borderColor: "var(--mairo-line)", background: "rgba(var(--mairo-fg-rgb),0.02)" }}>
                      <p className="text-[14.5px] font-semibold text-white">{f.title}</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-white/65">{f.why}</p>
                      <p className="mt-2 text-[13px] leading-relaxed text-white/85"><span className="font-semibold text-violet-200">Change: </span>{f.change}</p>
                      {f.evidence && <p className="mt-2 border-l-2 border-white/15 pl-3 text-[12px] leading-relaxed text-white/50">Seen on your site: {f.evidence}</p>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-5 text-[13.5px] text-white/65">MAIRO&rsquo;s checks found nothing on the pages it read that needs changing before you advertise.</p>
              )}
              <p className="mt-4 text-[12.5px] text-white/50">From {r.website.pagesRead} public page{r.website.pagesRead === 1 ? "" : "s"}. MAIRO can&rsquo;t see anything behind a login, and a pixel set up inside a store platform&rsquo;s own settings may not show on public pages.</p>
            </>
          ) : (
            actions && (
              <button type="button" onClick={actions.onEdit} className="mp-noprint inline-flex min-h-[42px] items-center rounded-full border border-white/15 px-4 text-[13.5px] text-white/85 transition hover:border-violet-400/60 hover:text-white">
                Add my website and regenerate
              </button>
            )
          )}
        </Section>

        {/* F */}
        <Section id="plan-month" letter="F" title="Your first 30 days with MAIRO" intro={<>What MAIRO would do, week by week, if you put it to work. These are planned actions — none of them has happened, and nothing launches or spends without your approval.</>}>
          <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {r.month.map((w) => (
              <li key={w.week} className="flex flex-col rounded-2xl border p-4" style={{ borderColor: "var(--mairo-line)", background: "rgba(var(--mairo-fg-rgb),0.02)" }}>
                <p className="flex items-center justify-between text-[12px] font-semibold uppercase tracking-[0.14em] text-violet-300">
                  Week {w.week}
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-white/50">Planned</span>
                </p>
                <p className="mt-1 text-[17px] font-semibold text-white">{w.title}</p>
                <ul className="mt-2.5 space-y-2">
                  {w.actions.map((a) => <li key={a} className="text-[13px] leading-relaxed text-white/70">{a}</li>)}
                </ul>
              </li>
            ))}
          </ol>
        </Section>
      </div>

      {/* The step from the free plan to MAIRO doing the work. */}
      <section aria-labelledby="work-title" className="mp-noprint relative mt-10 overflow-hidden rounded-[32px] border border-violet-400/30 p-6 sm:p-10" style={{ background: "radial-gradient(80% 120% at 100% 0%, rgba(47,107,255,0.28), transparent 60%), radial-gradient(70% 90% at 0% 100%, rgba(53,108,255,0.16), transparent 60%), linear-gradient(170deg,#141833,#0b0d1a)" }}>
        <h2 id="work-title" className="max-w-[760px] text-[clamp(26px,4vw,42px)] font-semibold leading-[1.06] tracking-[-0.035em] text-white [text-wrap:balance]">
          {actions ? "Your strategy is ready. Let MAIRO put it to work." : "Want a plan like this for your business?"}
        </h2>
        <p className="mt-3 max-w-[720px] text-[15.5px] leading-relaxed text-white/72">
          {actions
            ? "Go from recommendations to advertising campaigns with your AI team managing the workflow."
            : "Tell MAIRO about your business. Get a personalized Meta advertising strategy, creative ideas, audience recommendations, and a budget plan — free."}
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-emerald-300">Free — {actions ? "yours now" : "in every plan"}</p>
            <ul className="mt-3 space-y-2 text-[14px] text-white/85">
              {["Your Meta advertising strategy", "Who to target", "Your monthly budget breakdown", "Three AI ad concepts", "Website suggestions", "A 30-day roadmap"].map((t) => (
                <li key={t} className="flex gap-2.5"><span aria-hidden className="text-emerald-300">✓</span>{t}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-[24px] border border-violet-400/35 bg-violet-500/[0.08] p-5">
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-violet-200">With a MAIRO subscription</p>
            <ul className="mt-3 space-y-2 text-[14px] text-white/85">
              {["Finished ad creatives from your concepts", "Connect your own Meta ad account", "Campaigns built for you, switched off until you approve", "Review and approve every ad and budget", "Launch the ads you approved", "Performance monitored every day", "Optimization recommendations, each waiting for your approval", "Your AI advertising team at work", "Your dashboard and reports"].map((t) => (
                <li key={t} className="flex gap-2.5"><span aria-hidden className="text-violet-300">✦</span>{t}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          {actions ? (
            <button type="button" onClick={actions.onWork} disabled={actions.working} className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-[image:var(--mairo-ramp)] px-7 text-[16px] font-semibold text-white shadow-[var(--mairo-glow-key)] transition hover:brightness-110 disabled:opacity-60">
              {actions.working ? "Saving your strategy…" : "Activate Your AI Advertising Team →"}
            </button>
          ) : (
            <Link href="/preview" className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-[image:var(--mairo-ramp)] px-7 text-[16px] font-semibold text-white shadow-[var(--mairo-glow-key)] transition hover:brightness-110">
              Build My Free AI Ad Plan →
            </Link>
          )}
          <Link href="/#pricing" className="inline-flex min-h-[52px] items-center justify-center rounded-full border border-white/20 px-6 text-[15px] font-semibold text-white transition hover:border-white/45">
            Explore Plans
          </Link>
        </div>
        <p className="mt-5 max-w-[760px] text-[13px] leading-relaxed text-white/55">
          {actions ? "Your strategy comes with you: setup opens with your answers already filled in, for you to confirm. " : ""}
          Creating an account is free. Plans start at ${starter.priceMonthly} a month{starter.trialDays ? `, and ${starter.name} includes a ${STARTER_TRIAL_DAYS}-day free trial` : ""}. Your ad spend is separate — Meta charges it to your own ad account, at the budget you approve.
        </p>
        {actions && (
          <p className="mt-2 text-[13px] text-white/55">
            Already have an account?{" "}
            <button type="button" onClick={actions.onSignIn} className="text-white/80 underline underline-offset-4 hover:text-white">Sign in and keep this plan</button>
          </p>
        )}
        {actions?.save.status === "error" && <p role="alert" className="mt-3 text-[13.5px] text-red-300">{actions.save.message}</p>}
      </section>

      {actions && actions.save.status !== "saved" && <AccountPrompt onSave={actions.onSave} />}
    </article>
  );
}

function ActionBar({ r, a }: { r: PlanReport; a: ReportActions }) {
  const [goalOpen, setGoalOpen] = useState(false);
  const btn = "inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.03] px-3.5 text-[13px] text-white/85 transition hover:border-white/35 hover:text-white disabled:opacity-50";
  return (
    <div className="mp-noprint mt-6">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={a.onEdit} className={btn}>Edit answers</button>
        <a href="#plan-budget" className={btn}>Change my budget</a>
        <button type="button" onClick={() => setGoalOpen((o) => !o)} aria-expanded={goalOpen} aria-controls="goal-switch" className={btn}>Try another goal</button>
        <button type="button" onClick={a.onSave} disabled={a.save.status === "saving"} className={btn}>{a.save.status === "saved" ? "Saved ✓" : a.save.status === "saving" ? "Saving…" : "Save my strategy"}</button>
        <button type="button" onClick={a.onShare} disabled={a.save.status === "saving"} className={btn}>Share my strategy</button>
        <button type="button" onClick={() => window.print()} className={btn}>Download (PDF)</button>
      </div>
      {goalOpen && (
        <div id="goal-switch" className="mt-3 flex flex-wrap gap-2">
          {GOAL_OPTIONS.filter((g) => g.value !== r.goal).map((g) => (
            <button key={g.value} type="button" onClick={() => a.onGoal(g.value)} className="min-h-[38px] rounded-full border border-violet-400/35 bg-violet-500/[0.08] px-3.5 text-[13px] text-white transition hover:bg-violet-500/20">
              {g.label}
            </button>
          ))}
        </div>
      )}
      {(a.shareNote || a.save.status === "saved") && (
        <p role="status" className="mt-3 text-[13px] leading-relaxed text-white/70">
          {a.shareNote ?? (a.save.toAccount ? "Saved to your MAIRO account." : "Saved on this device, with a private link — create a free account to keep it everywhere.")}
          {a.save.token && (
            <>
              {" "}
              <Link href={`/s/${a.save.token}`} className="break-all text-violet-200 underline underline-offset-2 hover:text-white">Open the link</Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}

/** The optional account prompt: saved across devices, never required to read the plan. */
function AccountPrompt({ onSave }: { onSave: () => void }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <aside aria-label="Keep your plan" className="mp-noprint mx-auto mt-6 flex max-w-[860px] flex-col gap-3 rounded-[22px] border px-5 py-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--mairo-line)", background: "rgba(var(--mairo-fg-rgb),0.02)" }}>
      <p className="text-[13.5px] leading-relaxed text-white/70">
        <span className="font-semibold text-white">Want this plan on every device?</span> Save it now — a free account keeps it for good. No card needed.
      </p>
      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={onSave} className="min-h-[40px] rounded-full bg-white px-4 text-[13.5px] font-semibold text-[#111] transition hover:bg-white/90">Save my strategy</button>
        <button type="button" onClick={() => setDismissed(true)} className="min-h-[40px] rounded-full px-3 text-[13.5px] text-white/60 hover:text-white">Not now</button>
      </div>
    </aside>
  );
}
