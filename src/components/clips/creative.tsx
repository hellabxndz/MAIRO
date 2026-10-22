"use client";

import { BusinessArt } from "@/components/hero-story/art";
import { AdMock } from "@/components/plan-generator/ad-mock";
import { DemoFrame } from "@/components/console/demo";
import { Panel, Pill, primaryAction, quietAction } from "@/components/console/kit";
import { SAMPLE_ADS, SampleAdCard } from "@/components/home/sample-creatives";
import { pressedAt, typed, type ClipLayout } from "@/lib/demo/clip";
import { SHOP, SHOP_PLAN } from "@/lib/demo/shop-sample";
import type { PlanConcept } from "@/lib/preview/plan-concepts";
import type { Clip } from "./stage";

// "Creative ideas built around your brand." — the Creative Studio for the
// sample shop: the angles MAIRO suggests from what the website says, the
// owner's own edit to a headline, the finished picture (a subscription
// feature, paid in credits, and only charged if it's made), the Facebook and
// Instagram feed previews, and approval — which publishes nothing. Then the
// same studio for other kinds of business, every one a labelled sample.
//
// The picture is sample artwork and says so; MAIRO's real pictures are made
// by its image model on a subscription. A concept is never shown as a
// finished video.

const CONCEPTS = SHOP_PLAN.written!.concepts as PlanConcept[];
const NEW_HEADLINE = "Made by hand. Yours every morning.";

export const CREATIVE_T = {
  pickOffer: 1900,
  pickFirst: 3300,
  edit: 4500,
  type: [5000, 6500] as const,
  done: 7000,
  create: 8100,
  make: 9500,
  made: 11000,
  ig: 12000,
  fb: 13400,
  review: 14700,
  approve: 16000,
  gallery: 17600,
  end: 22500,
} as const;
const T = CREATIVE_T;

type State = { selected: number; editing: boolean; headline: string; quote: boolean; making: boolean; image: boolean; placement: "facebook" | "instagram"; status: "suggested" | "draft" | "review" | "approved"; pressed: string | null };

export function creativeState(t: number): State {
  const selected = t < T.pickOffer + 120 ? 0 : t < T.pickFirst + 120 ? 2 : 0;
  const edited = t >= T.done + 120;
  return {
    selected,
    editing: t >= T.edit + 120 && t < T.done + 120,
    headline: t < T.type[0] ? CONCEPTS[0].headline : typed(NEW_HEADLINE, t, T.type[0], T.type[1]),
    quote: t >= T.create + 120 && t < T.made,
    making: t >= T.make + 120 && t < T.made,
    image: t >= T.made,
    placement: t >= T.ig + 120 && t < T.fb + 120 ? "instagram" : "facebook",
    status: t >= T.approve + 120 ? "approved" : t >= T.review + 120 ? "review" : edited ? "draft" : "suggested",
    pressed: pressedAt(t, T.pickOffer) ? "angle-2" : pressedAt(t, T.pickFirst) ? "angle-0" : pressedAt(t, T.edit) ? "edit" : pressedAt(t, T.done) ? "done" : pressedAt(t, T.create) ? "create" : pressedAt(t, T.make) ? "make" : pressedAt(t, T.ig) ? "ig" : pressedAt(t, T.fb) ? "fb" : pressedAt(t, T.review) ? "review" : pressedAt(t, T.approve) ? "approve" : null,
  };
}

const press = (on: boolean) => (on ? { transform: "scale(0.96)", filter: "brightness(1.15)" } : undefined);

const STATUS: Record<State["status"], { tone: "violet" | "muted" | "warn" | "blue" | "live"; word: string }> = {
  suggested: { tone: "violet", word: "AI recommendation" },
  draft: { tone: "muted", word: "Draft" },
  review: { tone: "warn", word: "Ready for review" },
  approved: { tone: "blue", word: "Approved" },
};

const ART = ["demo", "problem", "offer"] as const;

function Studio({ s, narrow }: { s: State; narrow: boolean }) {
  const c = s.selected === 0 ? { ...CONCEPTS[0], headline: s.headline || " " } : CONCEPTS[s.selected];
  const art = <BusinessArt type="shop" variant={ART[s.selected]} />;
  return (
    <DemoFrame view="creatives" owner={SHOP.owner} sampleLabel={false} label="Product demo: the MAIRO Creative Studio for a fictional shop">
      <div className="space-y-4">
        <div>
          <p className="text-[24px] font-semibold tracking-[-0.02em] text-white">Creative Studio</p>
          <p className="mt-1 text-[13.5px] text-muted">Ideas for {SHOP.name}, built from what your website says.</p>
        </div>

        {/* The angles MAIRO suggests. */}
        <Panel id="angles" title="Angles MAIRO suggests">
          <ul className={`grid gap-2.5 ${narrow ? "" : "grid-cols-3"}`}>
            {CONCEPTS.map((k, i) => (
              <li key={k.label} data-cue={`angle-${i}`} className="flex items-start gap-3 rounded-2xl border p-3" style={{ borderColor: s.selected === i ? "rgba(238,238,238,0.7)" : "var(--mairo-line)", background: s.selected === i ? "rgba(255,255,255,0.10)" : "transparent", ...press(s.pressed === `angle-${i}`) }}>
                <span className="h-14 w-11 shrink-0 overflow-hidden rounded-lg [&>img]:h-full [&>img]:w-full [&>svg]:h-full [&>svg]:w-full">
                  <BusinessArt type="shop" variant={ART[i]} />
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[12.5px] font-medium text-white">{k.label}</span>
                    {i === 0 && <span className="rounded-full bg-[image:var(--mairo-ramp)] px-2 py-0.5 text-[10px] font-medium text-black">Test this first</span>}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-white/70">“{i === 0 ? s.headline || " " : k.headline}”</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <div className={`grid gap-4 ${narrow ? "" : "grid-cols-[minmax(0,1fr)_340px]"}`}>
          {/* The concept, its words and its state. */}
          <Panel id="concept" title={c.label} tone="lit">
            <div className="-mt-1 flex flex-wrap items-center gap-2">
              <Pill tone={STATUS[s.status].tone} dot>
                {STATUS[s.status].word}
              </Pill>
              <span className="text-[12px] text-faint">{c.format === "Short video" ? "Short video idea · you film it" : c.format}</span>
            </div>
            <dl className="mt-3 space-y-3 text-[13px] leading-relaxed">
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-faint">Headline</dt>
                <dd className="mt-1">
                  {s.editing ? (
                    <span className="flex items-center gap-2 rounded-xl border border-[#eeeeee]/70 bg-[#141414] px-3 py-2 text-[15px] font-semibold text-white">
                      {s.headline}
                      <span className="h-4 w-px animate-pulse bg-cyan-200" />
                    </span>
                  ) : (
                    <span className="text-[16px] font-semibold text-white">{c.headline}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-faint">Primary text</dt>
                <dd className="mt-0.5 text-white/85">{c.primaryText}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-faint">Visual direction</dt>
                <dd className="mt-0.5 text-white/70">{c.visual}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-faint">Why MAIRO recommends it</dt>
                <dd className="mt-0.5 text-white/75">{c.why}</dd>
              </div>
            </dl>

            {s.quote && (
              <div data-cue="quote" className="mt-4 rounded-xl bg-white/[0.05] px-4 py-3 text-[13px]">
                <p className="text-white">
                  This costs <strong>1 AI credit</strong>. You have 39 of 40 left this month.
                </p>
                <p className="mt-1 text-[12px] text-muted">Credits are used only if the picture is made. If it fails, they&apos;re returned.</p>
                <span data-cue="make" className={`${primaryAction} mt-3`} style={press(s.pressed === "make")}>
                  {s.making ? "Making your picture… up to a minute" : "Make it — 1 credit"}
                </span>
              </div>
            )}

            {s.status === "approved" ? (
              <p data-cue="approved" className="mt-4 text-[12.5px] text-live">✓ Approved — ready for a campaign. Nothing is published.</p>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                {s.status === "review" ? (
                  <span data-cue="approve" className={primaryAction} style={press(s.pressed === "approve")}>
                    Approve
                  </span>
                ) : s.image ? (
                  <span data-cue="review" className={primaryAction} style={press(s.pressed === "review")}>
                    Review and approve
                  </span>
                ) : (
                  <span data-cue="create" className={primaryAction} style={press(s.pressed === "create")}>
                    Create this ad
                  </span>
                )}
                <span data-cue="edit" className={quietAction} style={press(s.pressed === "edit" || s.pressed === "done")}>
                  {s.editing ? "Done" : "Edit headline"}
                </span>
              </div>
            )}
          </Panel>

          {/* Where it would run. */}
          <Panel id="preview" title="Preview">
            <div className="-mt-1 mb-3 flex gap-1 rounded-xl bg-white/[0.04] p-1 text-[12px]">
              <span data-cue="fb" className={`flex-1 rounded-lg px-2 py-1.5 text-center ${s.placement === "facebook" ? "bg-white/[0.10] text-white" : "text-muted"}`} style={press(s.pressed === "fb")}>
                Facebook Feed
              </span>
              <span data-cue="ig" className={`flex-1 rounded-lg px-2 py-1.5 text-center ${s.placement === "instagram" ? "bg-white/[0.10] text-white" : "text-muted"}`} style={press(s.pressed === "ig")}>
                Instagram Feed
              </span>
            </div>
            <div className={narrow ? "" : "mx-auto max-w-[300px]"}>
              <AdMock c={c} business={SHOP.name} placement={s.placement} domain={SHOP.site} image={s.image && s.selected === 0 ? art : undefined} />
            </div>
          </Panel>
        </div>
      </div>
    </DemoFrame>
  );
}

function Gallery({ narrow }: { narrow: boolean }) {
  const ads = ["fashion", "skincare", "realestate", "local", "online"].map((k) => SAMPLE_ADS.find((a) => a.key === k)!);
  return (
    <div className="px-8 pb-10 pt-12">
      <p className="text-center text-[30px] font-semibold tracking-[-0.03em] text-white">Built around any brand.</p>
      <p className="mt-2 text-center text-[14px] text-white/60">Sample creatives for fictional businesses — what MAIRO helps you make.</p>
      <ul data-cue="gallery" className={`mt-8 grid gap-4 ${narrow ? "grid-cols-2" : "grid-cols-5"}`}>
        {ads.slice(0, narrow ? 4 : 5).map((a) => (
          <li key={a.key}>
            <SampleAdCard ad={a} compact />
          </li>
        ))}
      </ul>
    </div>
  );
}

export const CREATIVE_CLIP: Clip = {
  id: "creative",
  title: "MAIRO's Creative Studio making ads for a fictional shop",
  duration: T.end,
  posterAt: 12600,
  captions: [
    { start: 0, end: 4300, text: "MAIRO suggests angles for your ads, built from what your business actually says." },
    { start: 4300, end: 7800, text: "Every word is yours to change." },
    { start: 7800, end: 11600, text: "With a subscription, MAIRO makes the finished picture — one credit, used only if it's made." },
    { start: 11600, end: 14500, text: "Preview it where it will run: the Facebook and Instagram feeds." },
    { start: 14500, end: 17500, text: "Nothing is used until you approve it." },
    { start: 17500, end: 22500, text: "Ideas built around your brand, whatever you sell." },
  ],
  scenes: [
    {
      id: "studio",
      label: "Creative Studio",
      start: 0,
      end: T.gallery,
      world: (t: number, layout: ClipLayout) => <Studio s={creativeState(t)} narrow={layout === "narrow"} />,
      layoutKey: (t) => {
        const s = creativeState(t);
        return `${s.selected}|${s.editing}|${s.quote}|${s.image}|${s.placement}|${s.status}`;
      },
      cursor: [
        { at: T.pickOffer, cue: '[data-cue="angle-2"]', click: true },
        { at: T.pickFirst, cue: '[data-cue="angle-0"]', click: true },
        { at: T.edit, cue: '[data-cue="edit"]', click: true },
        { at: T.done, cue: '[data-cue="edit"]', click: true },
        { at: T.create, cue: '[data-cue="create"]', click: true },
        { at: T.make, cue: '[data-cue="make"]', click: true },
        { at: T.ig, cue: '[data-cue="ig"]', click: true },
        { at: T.fb, cue: '[data-cue="fb"]', click: true },
        { at: T.review, cue: '[data-cue="review"]', click: true },
        { at: T.approve, cue: '[data-cue="approve"]', click: true },
      ],
      camera: [
        { at: 0, zoom: 1.05, narrowZoom: 1, dur: 1 },
        { at: 900, cue: '[data-panel="angles"]', zoom: 1.15, narrowZoom: 1, align: "top", dur: 900 },
        { at: 3900, cue: '[data-panel="concept"]', zoom: 1.25, narrowZoom: 1, align: "top" },
        { at: 7600, cue: '[data-panel="concept"]', zoom: 1.1, narrowZoom: 1, align: "center" },
        { at: 10600, cue: '[data-panel="preview"]', zoom: 1.2, narrowZoom: 1, align: "top" },
        { at: 14200, cue: '[data-panel="concept"]', zoom: 1.15, narrowZoom: 1, align: "center" },
      ],
    },
    {
      id: "gallery",
      label: "Any brand",
      start: T.gallery,
      end: T.end,
      world: (_t: number, layout: ClipLayout) => <Gallery narrow={layout === "narrow"} />,
      camera: [{ at: T.gallery, zoom: 1, dur: 1 }],
    },
  ],
};
