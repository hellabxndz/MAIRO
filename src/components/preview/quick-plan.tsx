"use client";

import Link from "next/link";
import { useState, type RefObject } from "react";
import { FACT_LABEL, type Direction, type Preview, type PreviewFacts } from "@/lib/preview/build";
import { analysisSteps, growthActions, opportunities } from "@/lib/preview/consult";
import { BUSINESS_TYPES, businessTypeFrom } from "@/lib/onboarding/business-types";
import { PLANS, PRO_TRIAL_DAYS } from "@/lib/plans";
import type { Finding } from "@/lib/website/audit";
import { Panel, Pill, primaryAction, quietAction } from "@/components/console/kit";

// The quick plan: what MAIRO would build for this business, from the few
// things the visitor gave — the first campaign, three ads, what MAIRO does
// after, and a few optional details that sharpen it, all on one screen. It
// comes straight after "Build My Free Ad Plan": no questions first, no
// waiting. The full plan (every section, placements, editing, refining) is a
// press away, built from the same facts.
//
// Honest by construction: what it didn't have is said, not filled in; the ads
// are concepts — words and a direction — until there's a picture; nothing
// here is a forecast, and nothing runs or is charged without a yes.

type Sharpen = "location" | "businessType" | "customer" | "offer" | "proof";

const ASK: Record<Exclude<Sharpen, "businessType">, { label: string; placeholder: string; gives: string }> = {
  location: { label: "Where are your customers?", placeholder: "e.g. Austin, TX — or where you ship to", gives: "shows the ads only where you work" },
  customer: { label: "Who's it for?", placeholder: "e.g. busy parents, local homeowners", gives: "adds an ad written for them" },
  offer: { label: "An offer you really run", placeholder: "e.g. first visit free", gives: "adds an ad that leads with it" },
  proof: { label: "Something true that builds trust", placeholder: "e.g. 10 years in business", gives: "adds an ad that opens with it" },
};

export function QuickPlan({
  preview: p,
  facts,
  findings,
  instagram = null,
  headingRef,
  signUpHref,
  onSave,
  onEdit,
  onRefine,
  onFull,
  onStartOver,
}: {
  preview: Preview;
  facts: PreviewFacts;
  findings: Finding[];
  instagram?: string | null;
  headingRef: RefObject<HTMLHeadingElement | null>;
  signUpHref: string;
  onSave: () => void;
  onEdit: () => void;
  onRefine: (patch: Partial<PreviewFacts>) => void;
  onFull: () => void;
  onStartOver: () => void;
}) {
  const actions = growthActions(facts, p, findings).slice(0, 4);
  const steps = analysisSteps(facts, p, opportunities(facts, p, findings, instagram), growthActions(facts, p, findings));
  const given = p.builtFrom.website + p.builtFrom.instagram + p.builtFrom.you;
  // The details that would sharpen it: what's missing, at most three, the area and the industry first.
  const missing: Sharpen[] = (["location", "businessType", "customer", "offer", "proof"] as Sharpen[])
    .filter((k) => (k === "businessType" ? !businessTypeFrom(facts.businessType) : !facts[k].trim()))
    .slice(0, 3);
  const [draft, setDraft] = useState<Partial<Record<Sharpen, string>>>({});
  const [updated, setUpdated] = useState(false);
  const changed = Object.values(draft).some((v) => v && v.trim());

  return (
    <article aria-labelledby="qp-title" className="mx-auto max-w-[1080px]">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="violet" dot>
            Your free ad plan
          </Pill>
          <Pill tone="muted">Not launched · nothing spent</Pill>
          <Pill tone="blue">
            Built from {given} detail{given === 1 ? "" : "s"}
          </Pill>
        </div>
        <h1 id="qp-title" ref={headingRef} tabIndex={-1} className="mt-4 text-[clamp(28px,4.4vw,48px)] font-semibold leading-[1.05] tracking-[-0.035em] text-white outline-none [text-wrap:balance]">
          {p.name}: here&rsquo;s what MAIRO would build for you
        </h1>
        <p className="mt-3 max-w-[760px] text-[15.5px] leading-relaxed text-white/72">
          A quick plan from what you told MAIRO. Your first campaign, three ads written for {facts.offering.trim() ? <span className="text-white">{facts.offering.trim().replace(/[.!]+$/, "").toLowerCase()}</span> : "your business"}, and what MAIRO looks after for you. Nothing is spent, and nothing runs until you approve it.
        </p>
      </header>

      <div className="mt-7 space-y-4">
        <Panel id="qp-campaign" title="1 · Your first campaign">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="The goal" value={p.plan.optimiseFor} />
            <Tile label="Where it runs" value="Facebook & Instagram" note="Through your own Meta ad account" />
            <Tile label="Who sees it" value={p.plan.audience} small />
            <Tile label="Starting budget" value={`$${p.allocation.daily} a day`} note={p.allocation.fromOwner ? "From your monthly figure" : "An example — you choose"} />
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-white/65">
            {p.strategy.campaign} Three ad versions run side by side for two weeks, so the results show which one works — then MAIRO suggests what to keep.
          </p>
        </Panel>

        <Panel id="qp-ads" title="2 · Your first three ads">
          {/* On a phone the three ads are a row to swipe through, so the plan stays short. */}
          <ol aria-label="Three ad concepts" className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:thin] md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0">
            {p.directions.map((d, i) => (
              <li key={d.angle} className="w-[84%] shrink-0 snap-start md:w-auto">
                <MiniAd d={d} business={p.name} first={i === 0} />
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[12px] text-white/45 md:hidden">Swipe to see all three.</p>
          <p className="mt-3 text-[12.5px] leading-relaxed text-white/55">
            Concepts: MAIRO writes the words now. The picture or video comes from your own photos and videos — or MAIRO&rsquo;s picture tools on a paid plan — after you sign up, and you approve every ad before it runs.
          </p>
        </Panel>

        <Panel id="qp-mairo" title="3 · What MAIRO does for you">
          <ul className="grid gap-3 md:grid-cols-2">
            {actions.map((a) => (
              <li key={a.title} className="rounded-2xl border p-4" style={{ borderColor: "var(--mairo-line)", backgroundImage: "var(--mairo-glass)" }}>
                <p className="text-[14.5px] font-semibold text-white">{a.title}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-white/70">{a.mairo}</p>
              </li>
            ))}
          </ul>
        </Panel>

        {missing.length > 0 && (
          <Panel id="qp-sharpen" title="Make it sharper (optional)">
            <p className="-mt-1 text-[13.5px] leading-relaxed text-white/70">
              MAIRO built this from just {given} detail{given === 1 ? "" : "s"}. Add any of these and the plan updates — MAIRO never fills them in for you.
            </p>
            {p.assumed.length > 0 && (
              <ul className="mt-2 space-y-1 text-[12.5px] leading-relaxed text-white/55">
                {p.assumed.map((a) => (
                  <li key={a.key}>· {a.text}</li>
                ))}
              </ul>
            )}
            <form
              className="mt-3 grid gap-3 md:grid-cols-3"
              onSubmit={(e) => {
                e.preventDefault();
                const patch: Partial<PreviewFacts> = {};
                for (const k of missing) {
                  const v = (draft[k] ?? "").replace(/\s+/g, " ").trim();
                  if (!v) continue;
                  if (k === "businessType") Object.assign(patch, { businessType: v, typeFrom: "you" as const });
                  else patch[k] = v.slice(0, 90);
                }
                if (!Object.keys(patch).length) return;
                onRefine(patch);
                setDraft({});
                setUpdated(true);
              }}
            >
              {missing.map((k) =>
                k === "businessType" ? (
                  <div key={k}>
                    <label htmlFor="qp-businessType" className="block text-[12.5px] font-medium text-white">Your industry</label>
                    <p className="text-[11.5px] text-faint">Decides what the campaign counts as a result.</p>
                    <select id="qp-businessType" value={draft.businessType ?? ""} onChange={(e) => setDraft((d) => ({ ...d, businessType: e.target.value }))} className={field}>
                      <option value="" className="bg-[#1c1c1c]">Choose one</option>
                      {BUSINESS_TYPES.map((t) => (
                        <option key={t.id} value={t.id} className="bg-[#1c1c1c]">{t.label}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div key={k}>
                    <label htmlFor={`qp-${k}`} className="block text-[12.5px] font-medium text-white">{ASK[k].label}</label>
                    <p className="text-[11.5px] text-faint">Optional — {ASK[k].gives}.</p>
                    <input id={`qp-${k}`} value={draft[k] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))} maxLength={90} placeholder={ASK[k].placeholder} aria-label={FACT_LABEL[k]} className={field} />
                  </div>
                ),
              )}
              <div className="md:col-span-3 flex flex-wrap items-center gap-3">
                <button type="submit" disabled={!changed} className={`${quietAction} disabled:opacity-50`}>
                  Update my plan
                </button>
                {updated && (
                  <p role="status" className="text-[12.5px] text-emerald-300">
                    Updated — the campaign and ads above now use what you added.
                  </p>
                )}
              </div>
            </form>
          </Panel>
        )}

        <Panel id="qp-next" title="Your next step" tone="lit">
          <h2 className="max-w-[820px] text-[clamp(24px,3.2vw,36px)] font-semibold leading-[1.1] tracking-[-0.03em] text-white [text-wrap:balance]">
            Your Growth Plan Is Ready. <span className="bg-gradient-to-r from-[#ffffff] via-[#ffffff] to-[#f6f6f6] bg-clip-text text-transparent">Let MAIRO Bring It to Life.</span>
          </h2>
          <p className="mt-3 max-w-[720px] text-[14.5px] leading-relaxed text-white/75">MAIRO can help turn this strategy into real advertising campaigns, create your ad creatives, and help you manage and optimize your advertising.</p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <Link href={signUpHref} onClick={onSave} className={primaryAction}>
              Approve My Plan
            </Link>
            <button type="button" onClick={onEdit} className={quietAction}>
              Make Changes
            </button>
            <button type="button" onClick={onFull} className={quietAction}>
              See the full plan
            </button>
          </div>
          <p className="mt-3 max-w-[760px] text-[12.5px] leading-relaxed text-white/60">
            Approving needs a free account — no card. Your plan carries over. A subscription is needed only when MAIRO builds and runs your campaigns — from ${PLANS[0].priceMonthly} a month, with a {PRO_TRIAL_DAYS}-day trial on {PLANS[0].name} (
            <Link href="/pricing" className="underline underline-offset-2 hover:text-white">
              see plans
            </Link>
            ). Your ad budget is paid to Meta. No ad runs and nothing is charged without your explicit confirmation.
          </p>
          <button type="button" onClick={onStartOver} className="mt-3 text-[12.5px] text-white/55 underline underline-offset-2 hover:text-white">
            Start over with a different business
          </button>
        </Panel>

        <details className="group rounded-2xl border px-4 py-3" style={{ borderColor: "var(--mairo-line)" }}>
          <summary className="cursor-pointer text-[13px] font-medium text-white/80 marker:text-white/40 hover:text-white">How MAIRO built this plan</summary>
          <ol className="mt-3 space-y-2">
            {steps.map((s, i) => (
              <li key={s.label} className="flex gap-3 text-[13px]">
                <span aria-hidden className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-[11px] text-emerald-300">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block font-medium text-white">{s.label}</span>
                  <span className="block leading-relaxed text-white/65">{s.result}</span>
                </span>
              </li>
            ))}
          </ol>
        </details>
      </div>
    </article>
  );
}

const field =
  "mt-1.5 block min-h-[44px] w-full rounded-xl border border-white/12 bg-[#181818]/80 px-3 text-[14px] text-white placeholder:text-white/35 outline-none transition focus:border-violet-400/70 focus:ring-2 focus:ring-violet-400/25";

function Tile({ label, value, note, small = false }: { label: string; value: string; note?: string; small?: boolean }) {
  return (
    <div className="min-w-0 rounded-[18px] border p-3.5" style={{ borderColor: "var(--mairo-line)", backgroundImage: "var(--mairo-glass)" }}>
      <p className="text-[11.5px] text-muted">{label}</p>
      <p className={`mt-1 font-semibold leading-snug tracking-[-0.01em] text-white ${small ? "text-[13.5px]" : "text-[16.5px]"}`}>{value}</p>
      {note && <p className="mt-0.5 text-[11px] leading-snug text-faint">{note}</p>}
    </div>
  );
}

/** One ad, as it would read in the feed — the words MAIRO wrote and what the picture should show. A concept, so it says so. */
function MiniAd({ d, business, first }: { d: Direction; business: string; first: boolean }) {
  return (
    <figure className="flex h-full flex-col overflow-hidden rounded-2xl border bg-white text-[#111]" style={{ borderColor: "var(--mairo-line)" }}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[image:var(--mairo-ramp)] text-[12px] font-semibold text-black">{business.charAt(0).toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-semibold">{business}</p>
          <p className="text-[10.5px] text-[#666]">Sponsored · concept</p>
        </div>
        {first && <span className="shrink-0 rounded-full bg-[#ffffff] px-2 py-0.5 text-[10.5px] font-semibold text-black/70">Test this first</span>}
      </div>
      <p className="px-3 pb-2.5 text-[13px] leading-snug">{d.hook}</p>
      <div className="relative mx-3 flex aspect-[16/10] items-end overflow-hidden rounded-xl p-3" style={{ background: "linear-gradient(140deg, #343434 0%, #959595 55%, #d6d6d6 100%)" }}>
        <p className="text-[11.5px] leading-snug text-white/85">
          <span className="font-semibold text-white">Picture: </span>
          {d.visual}
        </p>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 px-3 py-2.5">
        <p className="min-w-0 truncate text-[12.5px] font-semibold">{d.headline}</p>
        <span className="shrink-0 rounded-md bg-[#e4e6eb] px-2.5 py-1 text-[11.5px] font-semibold">{d.cta}</span>
      </div>
      <figcaption className="border-t border-[#eee] px-3 py-2 text-[11px] text-[#666]">{d.label} — {d.why}</figcaption>
    </figure>
  );
}
