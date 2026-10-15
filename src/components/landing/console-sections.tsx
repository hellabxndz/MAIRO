"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DemoFrame, DemoScreen, ScaledFrame, type DemoView } from "@/components/console/demo";
import { PlacementMock, mockLabel, type Placement } from "@/app/dashboard/creatives/suggested/placements";
import { BusinessArt } from "@/components/hero-story/art";
import { Pill } from "@/components/console/kit";
import { EXAMPLES } from "@/lib/demo/examples";

// The homepage's interactive parts: the scroll reveal, the concepts in real
// placements, and the product tour — each drawn with the components the
// signed-in app uses, for the sample business, and labelled as a demo.

/** Marks the page so [data-reveal] sections rise in as they're reached. Without script, everything is simply visible. */
export function RevealOnScroll() {
  useEffect(() => {
    const root = document.documentElement;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    root.classList.add("js-reveal");
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.setAttribute("data-shown", "");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      root.classList.remove("js-reveal");
    };
  }, []);
  return null;
}

const CONCEPTS = EXAMPLES.service.concepts.map((c, i) => ({ ...c, why: i === 0 ? "A short video of the work makes a service easy to trust — MAIRO suggests testing it first." : i === 1 ? "Names the problem in the customer's words, then the fix." : "Leads with the one offer the business really runs." }));
const PLACES: { id: Placement; label: string }[] = [
  { id: "fb-feed", label: "Facebook feed" },
  { id: "ig-feed", label: "Instagram feed" },
  { id: "stories", label: "Instagram Story" },
];

/** Three concepts for the sample business, each in MAIRO's own Facebook and Instagram mock-ups. */
export function ConceptShowcase() {
  const [pick, setPick] = useState(0);
  const [place, setPlace] = useState<Placement>("fb-feed");
  const c = CONCEPTS[pick];
  const media = { kind: "art" as const, node: <BusinessArt type="service" variant={c.art} className="h-full w-full" /> };
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-start">
      <ol className="space-y-3">
        {CONCEPTS.map((x, i) => (
          <li key={x.id}>
            <button
              type="button"
              aria-pressed={pick === i}
              onClick={() => setPick(i)}
              className={`w-full rounded-[20px] border p-4 text-left transition ${pick === i ? "border-violet-400/60" : "hover:border-[color:var(--mairo-line-lit)]"}`}
              style={{ borderColor: pick === i ? undefined : "var(--mairo-line)", background: pick === i ? "linear-gradient(165deg, rgba(47,107,255,0.14), rgba(14,17,33,0.7) 60%)" : "rgba(var(--mairo-bg-rgb),0.5)" }}
            >
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Concept {i + 1}</span>
                <Pill tone="muted">{x.angle}</Pill>
                {i === 0 && <Pill tone="violet">Test this first</Pill>}
              </span>
              <span className="mt-2 block text-[16px] font-semibold text-white">{x.hook}</span>
              <span className="mt-1 block text-[13px] leading-relaxed text-white/70">{x.body}</span>
              <span className="mt-2 block text-[12px] text-faint">
                {x.format} · Button: {x.cta} · {x.why}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className="rounded-[24px] border p-4 sm:p-5" style={{ borderColor: "var(--mairo-line)", backgroundImage: "var(--mairo-glass)", boxShadow: "var(--mairo-glow-soft)" }}>
        <div role="group" aria-label="Placement" className="flex flex-wrap gap-1.5">
          {PLACES.map((p) => (
            <button key={p.id} type="button" aria-pressed={place === p.id} onClick={() => setPlace(p.id)} className={`rounded-full border px-3 py-1.5 text-[12.5px] transition ${place === p.id ? "border-violet-400/60 bg-violet-500/15 text-white" : "border-white/10 text-white/65 hover:text-white"}`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className={`mt-4 ${place === "stories" ? "mx-auto max-w-[250px]" : "mx-auto max-w-[360px]"}`}>
          <PlacementMock placement={place} media={media} words={{ hook: c.hook, body: c.body, cta: c.cta === "Get quote" ? "Get quote" : c.cta }} businessName={EXAMPLES.service.name} />
        </div>
        <p className="mt-3 text-center text-[11.5px] leading-relaxed text-faint">{mockLabel(place, media)}</p>
      </div>
    </div>
  );
}

const TABS: { id: DemoView; label: string; blurb: string }[] = [
  { id: "overview", label: "Overview", blurb: "The day's results, what needs you, and what your AI team is doing." },
  { id: "creatives", label: "Creative Studio", blurb: "The ads running now and the directions MAIRO suggests next." },
  { id: "approvals", label: "Approvals", blurb: "Every launch and change waits here, with the budget shown." },
  { id: "results", label: "Performance", blurb: "What Meta reports and what you confirmed — never mixed." },
];

/** The product tour: four screens of the sample account, in the real app frame. */
export function ProductTour() {
  const [tab, setTab] = useState<DemoView>("overview");
  const t = TABS.find((x) => x.id === tab)!;
  return (
    <div>
      <div role="tablist" aria-label="MAIRO screens" className="mx-auto flex max-w-[720px] flex-wrap justify-center gap-1.5 rounded-full border p-1.5" style={{ borderColor: "var(--mairo-line)", background: "rgba(var(--mairo-fg-rgb),0.03)" }}>
        {TABS.map((x) => (
          <button key={x.id} type="button" role="tab" id={`tour-${x.id}`} aria-selected={tab === x.id} aria-controls="tour-panel" onClick={() => setTab(x.id)} className={`rounded-full px-4 py-2 text-[13px] font-medium transition ${tab === x.id ? "text-white" : "text-white/60 hover:text-white"}`} style={tab === x.id ? { backgroundImage: "var(--mairo-ramp)", boxShadow: "var(--mairo-glow-lift)" } : undefined}>
            {x.label}
          </button>
        ))}
      </div>
      <p className="mt-4 text-center text-[14px] text-white/65">{t.blurb}</p>
      <div id="tour-panel" role="tabpanel" aria-labelledby={`tour-${tab}`} className="mt-6">
        <ScaledFrame width={1280} minScale={0.8} maxHeight={1700}>
          <DemoFrame view={tab}>
            <DemoScreen view={tab} />
          </DemoFrame>
        </ScaledFrame>
      </div>
    </div>
  );
}

/** A section heading in the night style: a small violet label, a big confident line, one sentence under it. */
export function SectionTitle({ eyebrow, title, sub, center = true, id }: { eyebrow: string; title: ReactNode; sub?: string; center?: boolean; id?: string }) {
  return (
    <div className={center ? "mx-auto max-w-[860px] text-center" : "max-w-[620px]"}>
      <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-violet-bright">{eyebrow}</p>
      <h2 id={id} className="mt-4 text-[clamp(32px,5vw,62px)] font-semibold leading-[1.0] tracking-[-0.045em] text-white [text-wrap:balance]">
        {title}
      </h2>
      {sub && <p className={`mt-5 text-[16.5px] leading-relaxed text-white/68 ${center ? "mx-auto max-w-[640px]" : ""}`}>{sub}</p>}
    </div>
  );
}
