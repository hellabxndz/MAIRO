import type { CSSProperties, ReactNode } from "react";
import type { Example } from "@/lib/demo/examples";
import { MOMENTS, STAGE, boxes, camera, reveal, sceneAt, type Layout } from "@/lib/demo/timeline";
import { BusinessArt } from "./art";
import { FeedPreview, Layer, StoryPreview } from "./stage";

// One frame of the 24-second landing story: a pure function of time, example
// and layout, in a light design with purple accents. Shared elements carry
// across scenes — the website's offer, imagery and button become the three
// cards the owner confirms; the cards become the strip the concepts are built
// on; the recommended concept becomes the feed draft and then sits inside the
// review; the review opens into the results.
//
// Everything here is a picture of the product with sample data, kept apart
// from the real website box beside it. Only what the product really does is
// shown: the video edit is the editor's trim, caption and crop, written to a
// new file; approving in the story sends nothing anywhere.

const INK = "#1d1838";
const MUTED = "#6b6688";
const LINE = "#e6e1f5";
const ACCENT = "#7c5cff";
const ACCENT_DEEP = "#5b3fd9";
const ACCENT_SOFT = "#f1edff";
const GOOD = "#0f8a5f";

export const STAGE_BACKGROUND = "radial-gradient(ellipse 70% 60% at 50% 35%, rgba(124,92,255,0.13), transparent 70%), radial-gradient(ellipse 50% 40% at 90% 95%, rgba(91,108,255,0.10), transparent 70%), linear-gradient(180deg, #fcfbff, #f2eeff)";
const card: CSSProperties = { background: "#ffffff", border: `1px solid ${LINE}`, boxShadow: "0 18px 44px -24px rgba(60,40,140,0.38), 0 2px 6px -2px rgba(60,40,140,0.08)", color: INK };
const primary: CSSProperties = { background: `linear-gradient(90deg, #6b5cff, ${ACCENT_DEEP})`, color: "#fff" };

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: ACCENT_DEEP }}>{children}</p>;
}

function Tick({ on, size = 16 }: { on: number; size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full text-white" style={{ width: size, height: size, fontSize: size * 0.62, background: GOOD, opacity: on, transform: `scale(${0.6 + 0.4 * on})` }} aria-hidden>
      ✓
    </span>
  );
}

// --- Business --------------------------------------------------------------

/** The MAIRO website box in the story. Only ever shows the example's .example address. */
function StageInput({ ex, t, compact }: { ex: Example; t: number; compact: boolean }) {
  const chars = Math.floor(ex.url.length * reveal(t, MOMENTS.typeFrom, MOMENTS.typeTo));
  const typed = ex.url.slice(0, chars);
  const caret = t < MOMENTS.press && Math.floor(t / 450) % 2 === 0;
  const pressed = t > MOMENTS.press && t < MOMENTS.press + 250;
  return (
    <div className="flex h-full items-center gap-2 rounded-full bg-white px-2 pl-4" style={{ border: `1.5px solid ${ACCENT}`, boxShadow: "0 16px 40px -22px rgba(91,63,217,0.55)" }}>
      <span className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: ACCENT_DEEP }}>MAIRO</span>
      <span className="min-w-0 flex-1 truncate text-[14px]" style={{ color: INK }}>
        {typed || <span style={{ color: MUTED }}>Your business website</span>}
        {caret && <span className="ml-[1px] inline-block h-[15px] w-[2px] translate-y-[2px]" style={{ background: INK }} />}
      </span>
      <span className="shrink-0 rounded-full px-4 py-2 text-[12.5px] font-semibold" style={{ ...primary, transform: pressed ? "scale(0.94)" : "none" }}>
        {compact ? "Free plan" : "See Your Free Plan"}
      </span>
    </div>
  );
}

function Mark({ label, o, className = "", children }: { label: string; o: number; className?: string; children: ReactNode }) {
  return (
    <div className={`relative ${className}`}>
      {children}
      {o > 0.01 && (
        <div className="pointer-events-none absolute -inset-1 rounded-md" style={{ opacity: o, border: `2px solid ${ACCENT}`, background: "rgba(124,92,255,0.08)", boxShadow: "0 0 0 4px rgba(124,92,255,0.14)" }}>
          <span className="absolute -top-2.5 left-2 whitespace-nowrap rounded px-1.5 py-[1px] text-[9.5px] font-semibold text-white" style={{ background: ACCENT }}>{label}</span>
        </div>
      )}
    </div>
  );
}

/** The example's own website, with what MAIRO points out: the offer, the imagery and the call to action. */
function SiteBrowser({ ex, t, narrow }: { ex: Example; t: number; narrow: boolean }) {
  const c = ex.colors;
  const mark = (i: 0 | 1 | 2) => reveal(t, MOMENTS.marks[i], MOMENTS.marks[i] + 350) * (1 - reveal(t, MOMENTS.marksEnd, MOMENTS.marksEnd + 400));
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[14px] bg-white" style={{ border: `1px solid ${LINE}`, boxShadow: "0 24px 60px -30px rgba(60,40,140,0.5)" }}>
      <div className="flex items-center gap-1.5 border-b px-3 py-2" style={{ borderColor: LINE, background: "#f6f4fc" }}>
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-2 truncate rounded-md bg-white px-2 py-0.5 text-[11px]" style={{ color: MUTED }}>{ex.url}</span>
      </div>
      <div className="relative flex-1 overflow-hidden" style={{ background: c.paper, color: c.ink }}>
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-[13px] font-bold tracking-tight">{ex.name}</span>
          <span className="flex gap-3 text-[11px] opacity-75">{ex.site.nav.map((n) => <span key={n}>{n}</span>)}</span>
        </div>
        <div className="grid grid-cols-[1.1fr_1fr] gap-3 px-4">
          <div className="pt-1">
            <Mark label="Offer" o={mark(0)}>
              <p className={`${narrow ? "text-[16px]" : "text-[19px]"} font-extrabold leading-[1.1] tracking-[-0.02em]`}>{ex.site.headline}</p>
            </Mark>
            <p className="mt-1.5 text-[11.5px] leading-snug opacity-75">{ex.site.sub}</p>
            <Mark label="Call to action" o={mark(2)} className="mt-2.5 inline-block">
              <span className="inline-block rounded-md px-3 py-1.5 text-[11.5px] font-semibold text-white" style={{ background: c.a }}>{ex.site.button}</span>
            </Mark>
          </div>
          <Mark label="Imagery" o={mark(1)}>
            <div className={`overflow-hidden rounded-lg ${narrow ? "aspect-square" : "aspect-[4/3.4]"}`}>
              <BusinessArt type={ex.type} variant="site" className="h-full w-full" />
            </div>
          </Mark>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 px-4">
          {(["demo", "problem", "offer"] as const).map((v) => (
            <div key={v} className="aspect-[4/3] overflow-hidden rounded-md opacity-90">
              <BusinessArt type={ex.type} variant={v} className="h-full w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Understanding -----------------------------------------------------------

const CARD_LABELS = [
  { title: "What you sell", short: "Offer", from: "From your website" },
  { title: "Who you serve", short: "Audience", from: "From your website" },
  { title: "Your goal", short: "Goal", from: "Suggested — you choose" },
] as const;

/** One of the three things MAIRO understood, which the owner confirms or edits. Folds into a chip once confirmed. */
function BusinessCard({ ex, which, t, pill, tiny }: { ex: Example; which: 0 | 1 | 2; t: number; pill: boolean; tiny: boolean }) {
  const label = CARD_LABELS[which];
  const value = [ex.story.cards.sell, ex.story.cards.serve, ex.story.cards.goal][which];
  const tick = reveal(t, MOMENTS.ticks[which], MOMENTS.ticks[which] + 250);
  if (pill) {
    return (
      <div className="flex h-full items-center gap-2 rounded-full px-3" style={card}>
        <Tick on={tick} size={14} />
        {tiny ? (
          <span className="truncate text-[11.5px] font-semibold">{label.short}</span>
        ) : (
          <span className="min-w-0 truncate text-[11.5px]">
            <span className="font-semibold" style={{ color: ACCENT_DEEP }}>{label.short}: </span>
            {value}
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col justify-center rounded-2xl px-4 py-2.5" style={card}>
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>{label.title}</Eyebrow>
        <span className="flex items-center gap-1.5">
          <span className="text-[10.5px] font-medium underline underline-offset-2" style={{ color: MUTED, opacity: 1 - tick }}>Edit</span>
          <Tick on={tick} />
        </span>
      </div>
      <p className="mt-1 text-[14px] font-semibold leading-snug">{value}</p>
      <p className="mt-0.5 text-[10.5px]" style={{ color: MUTED }}>{label.from}</p>
    </div>
  );
}

function ConfirmBar({ t }: { t: number }) {
  const done = t >= MOMENTS.confirm + 250;
  const pressed = t >= MOMENTS.confirm && t < MOMENTS.confirm + 250;
  return (
    <div className="flex h-full items-center justify-between gap-2 rounded-2xl px-3" style={card}>
      {done ? (
        <>
          <span className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: GOOD }}><Tick on={1} /> Confirmed by you</span>
          <span className="text-[10.5px]" style={{ color: MUTED }}>Change them anytime</span>
        </>
      ) : (
        <>
          <span className="text-[13px] font-semibold">Is this right?</span>
          <span className="flex items-center gap-2">
            <span className="rounded-lg px-2.5 py-1.5 text-[12px] font-medium" style={{ border: `1px solid ${LINE}`, color: MUTED }}>Edit</span>
            <span className="rounded-lg px-3 py-1.5 text-[12px] font-semibold" style={{ ...primary, transform: pressed ? "scale(0.94)" : "none" }}>Looks right</span>
          </span>
        </>
      )}
    </div>
  );
}

// --- Creatives ---------------------------------------------------------------

function Concept({ ex, i, t, recommended }: { ex: Example; i: number; t: number; recommended: boolean }) {
  const c = ex.concepts[i];
  const ring = recommended ? reveal(t, MOMENTS.recommend, MOMENTS.recommend + 500) : 0;
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-white" style={{ ...card, boxShadow: `${card.boxShadow}, 0 0 0 ${3 * ring}px rgba(124,92,255,${0.85 * ring})` }}>
      <div className="relative min-h-0 flex-[1.15]">
        <BusinessArt type={ex.type} variant={c.art} className="absolute inset-0 h-full w-full" />
        <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white">{c.format}</span>
        {ring > 0.05 && (
          <span className="absolute bottom-2 left-2 rounded-full px-2.5 py-1 text-[10.5px] font-semibold text-white shadow" style={{ background: ACCENT, opacity: ring }}>
            ★ Recommended first test
          </span>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: ex.colors.a }}>{c.angle}</p>
        <p className="mt-1 text-[16px] font-bold leading-[1.15] tracking-[-0.01em]">{c.hook}</p>
        <p className="mt-1 min-h-0 overflow-hidden text-[11.5px] leading-snug" style={{ color: MUTED }}>{c.body}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="min-w-0 truncate text-[10.5px]" style={{ color: MUTED }}>{ex.name}</span>
          <span className="shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-semibold text-white" style={{ background: ex.colors.a }}>{c.cta}</span>
        </div>
      </div>
    </div>
  );
}

function ReasonCard({ ex, compact }: { ex: Example; compact: boolean }) {
  if (compact) {
    return (
      <div className="flex h-full flex-col justify-center rounded-2xl px-3.5 py-2" style={card}>
        <Eyebrow>Why this one first</Eyebrow>
        <p className="mt-0.5 text-[13px] font-semibold leading-snug">{ex.story.reason}</p>
        <p className="mt-0.5 truncate text-[10.5px]" style={{ color: MUTED }}>Based on what you confirmed · a first test, not a forecast</p>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col rounded-2xl p-4" style={card}>
      <Eyebrow>Why this one first</Eyebrow>
      <p className="mt-1.5 text-[15px] font-semibold leading-snug">{ex.story.reason}</p>
      <p className="mt-3 text-[10.5px] font-medium" style={{ color: MUTED }}>Based on what you confirmed</p>
      <ul className="mt-1 space-y-1">
        {ex.story.basis.map((b) => (
          <li key={b} className="rounded-lg px-2 py-1 text-[11px]" style={{ background: ACCENT_SOFT, color: ACCENT_DEEP }}>{b}</li>
        ))}
      </ul>
      <p className="mt-auto pt-2 text-[10.5px]" style={{ color: MUTED }}>A first test, not a forecast.</p>
    </div>
  );
}

/** The recommended ad, small, as it sits in the review. */
function AdThumb({ ex }: { ex: Example }) {
  const c = ex.concepts[ex.selected];
  return (
    <div className="relative h-full overflow-hidden rounded-[18px] bg-black" style={{ border: "4px solid #141428" }}>
      <BusinessArt type={ex.type} variant={c.art} className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />
      <p className="absolute left-2.5 right-2.5 top-3 text-[13px] font-extrabold leading-tight text-white" style={{ textShadow: "0 2px 10px rgba(0,0,0,0.6)" }}>{c.hook}</p>
      <span className="absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-[10.5px] font-semibold text-black">{c.cta}</span>
    </div>
  );
}

// --- Editing -----------------------------------------------------------------

function Actions({ t, cols }: { t: number; cols: 1 | 2 }) {
  const chosen = reveal(t, MOMENTS.useVideo + 200, MOMENTS.useVideo + 500);
  const pressed = t >= MOMENTS.useVideo && t < MOMENTS.useVideo + 220;
  return (
    <div className="flex h-full flex-col rounded-2xl p-3" style={card}>
      <Eyebrow>Your draft is ready</Eyebrow>
      <div className={`mt-2 grid flex-1 gap-2 ${cols === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
        <div className="flex flex-col justify-center rounded-xl px-3 py-1.5" style={{ border: `1px solid ${LINE}`, opacity: 1 - 0.45 * chosen }}>
          <p className="text-[12.5px] font-semibold">Create this ad</p>
          <p className="text-[10.5px] leading-snug" style={{ color: MUTED }}>MAIRO makes the picture</p>
        </div>
        <div className="flex flex-col justify-center rounded-xl px-3 py-1.5" style={{ border: `1.5px solid ${chosen > 0.5 ? ACCENT : LINE}`, background: chosen > 0.5 ? ACCENT_SOFT : "#fff", transform: pressed ? "scale(0.96)" : "none" }}>
          <p className="flex items-center gap-1.5 text-[12.5px] font-semibold">Use my video {chosen > 0.5 && <Tick on={chosen} size={14} />}</p>
          <p className="text-[10.5px] leading-snug" style={{ color: MUTED }}>Upload a clip; MAIRO suggests edits</p>
        </div>
      </div>
    </div>
  );
}

function Frame({ ex, variant, caption, label }: { ex: Example; variant: "offer" | "demo"; caption?: string; label: string }) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg bg-black">
      <BusinessArt type={ex.type} variant={variant} className="absolute inset-0 h-full w-full" />
      {caption && <p className="absolute left-1 right-1 top-[10%] rounded bg-black/70 px-0.5 py-0.5 text-center text-[8px] font-bold leading-tight text-white">{caption}</p>}
      <span className="absolute bottom-1 left-1 right-1 truncate rounded bg-black/55 px-1 text-[8.5px] text-white/90">{label}</span>
    </div>
  );
}

/** A clip's length as a bar; the demonstration in purple. */
function Timeline({ total, from }: { total: number; from: number }) {
  return (
    <div className="relative mt-1.5 h-2 w-full overflow-hidden rounded-full" style={{ background: "#d9d4ea" }}>
      <div className="absolute inset-y-0 right-0 rounded-full" style={{ left: `${(from / total) * 100}%`, background: ACCENT }} />
    </div>
  );
}

/** The owner's own clip, before and after the one edit the editor really makes. */
function EditCompare({ ex, t, narrow }: { ex: Example; t: number; narrow: boolean }) {
  const v = ex.story.video;
  const after = reveal(t, MOMENTS.after, MOMENTS.after + 450);
  const mmss = (s: number) => `0:${String(s).padStart(2, "0")}`;
  const before = narrow ? { w: 150, h: 84 } : { w: 178, h: 100 };
  const afterH = narrow ? 120 : 128;
  const changes = [
    `Starts at the demonstration (${mmss(v.startsAtS)})`,
    "Caption added, 0:00–0:03",
    "Cropped to 9:16 for Stories and Reels",
    "Saved as a new file — your original is kept",
  ];
  return (
    <div className="flex h-full flex-col rounded-2xl p-3.5" style={card}>
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>Your video · suggested edit</Eyebrow>
        <span className="text-[10px]" style={{ color: MUTED }}>{mmss(v.lengthS)} clip</span>
      </div>
      <div className="mt-2 flex gap-3">
        <div className="flex shrink-0 flex-col" style={{ width: before.w }}>
          <p className="text-[10.5px] font-semibold" style={{ color: MUTED }}>Before</p>
          <div className="mt-1" style={{ height: before.h }}><Frame ex={ex} variant="offer" label={`0:00 · ${v.opening}`} /></div>
          <Timeline total={v.lengthS} from={v.startsAtS} />
          <p className="mt-1 text-[9.5px] leading-tight" style={{ color: MUTED }}>Demonstration starts at {mmss(v.startsAtS)}</p>
        </div>
        <div className="flex min-w-0 flex-1 flex-col" style={{ opacity: 0.25 + 0.75 * after }}>
          <p className="text-[10.5px] font-semibold" style={{ color: ACCENT_DEEP }}>After</p>
          <div className="mt-1 flex gap-2" style={{ height: afterH }}>
            <div className="h-full shrink-0" style={{ width: (afterH * 9) / 16 }}><Frame ex={ex} variant="demo" caption={after > 0.5 ? v.caption : undefined} label="0:00" /></div>
            <p className="min-w-0 self-end text-[9.5px] leading-tight" style={{ color: MUTED }}>Opens on {v.demo.toLowerCase()}</p>
          </div>
          <Timeline total={v.lengthS - v.startsAtS} from={0} />
          <p className="mt-1 text-[9.5px] leading-tight" style={{ color: MUTED }}>{mmss(v.lengthS - v.startsAtS)} · all demonstration</p>
        </div>
      </div>
      <ul className={`${narrow ? "mt-4 space-y-1.5" : "mt-2.5 space-y-1"}`}>
        {changes.map((c, i) => {
          const on = reveal(t, MOMENTS.editTicks[i], MOMENTS.editTicks[i] + 250);
          return (
            <li key={c} className="flex items-center gap-2 text-[11.5px]" style={{ opacity: 0.3 + 0.7 * on }}>
              <Tick on={on} size={14} /> {c}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// --- Approval ----------------------------------------------------------------

function ApprovalPanel({ ex, t, narrow }: { ex: Example; t: number; narrow: boolean }) {
  const approved = t >= MOMENTS.approve + 250;
  const pressed = t >= MOMENTS.approve && t < MOMENTS.approve + 250;
  const rows: [string, string][] = [
    ["Ad", `Recommended first test · ${ex.concepts[ex.selected].format.toLowerCase()}`],
    ["Sends people to", ex.review.destination],
    ["Budget", `${ex.review.budget} (example)`],
    ["Where", ex.review.where],
  ];
  return (
    <div className={`flex h-full flex-col rounded-2xl ${narrow ? "p-3.5" : "p-4"}`} style={card}>
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>Review your campaign</Eyebrow>
        <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "#fff7e3", color: "#7a5200" }}>Example budget</span>
      </div>
      {/* The recommended ad itself sits in the space on the left (it carries over from the previous scene). */}
      <div className={narrow ? "mt-2 grid min-h-0 flex-1 grid-cols-[124px_1fr] gap-3" : "mt-3 grid min-h-0 flex-1 grid-cols-[170px_1fr] gap-4"}>
        <div />
        <div className="flex min-w-0 flex-col">
          <dl className={narrow ? "space-y-1.5" : "space-y-2.5"}>
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[10px]" style={{ color: MUTED }}>{k}</dt>
                <dd className={`${narrow ? "text-[11.5px]" : "text-[12.5px]"} font-medium leading-snug`}>{v}</dd>
              </div>
            ))}
          </dl>
          {!narrow && <Decision approved={approved} pressed={pressed} />}
        </div>
      </div>
      {narrow && <Decision approved={approved} pressed={pressed} />}
    </div>
  );
}

function Decision({ approved, pressed }: { approved: boolean; pressed: boolean }) {
  return (
    <div className="mt-auto pt-3">
      <p className="text-[13px] font-semibold">You approve before launch.</p>
      <span className="mt-2 flex items-center justify-center gap-1.5 rounded-xl py-2 text-[12.5px] font-semibold" style={approved ? { background: "#e7f6ef", color: GOOD } : { ...primary, transform: pressed ? "scale(0.96)" : "none" }}>
        {approved ? "✓ Approved — demo" : "Approve campaign"}
      </span>
      <p className="mt-1.5 text-[10.5px] leading-snug" style={{ color: MUTED }}>
        {approved ? "This is a demo: nothing was sent to Meta. In your account, nothing launches until you approve it." : "Ad spend is paid to Meta, separately from MAIRO."}
      </p>
    </div>
  );
}

// --- Results -----------------------------------------------------------------

function ResultsBoard({ ex, t, narrow }: { ex: Example; t: number; narrow: boolean }) {
  const s = ex.story;
  const rec = reveal(t, MOMENTS.recommendation, MOMENTS.recommendation + 450);
  return (
    <div className={`flex h-full flex-col rounded-2xl ${narrow ? "p-3.5" : "p-5"}`} style={card}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <Eyebrow>This week</Eyebrow>
          <p className="text-[15px] font-semibold">{ex.name}</p>
          <p className="text-[11px]" style={{ color: MUTED }}>{s.spend} spent · Meta</p>
        </div>
        <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "#fff7e3", color: "#7a5200" }}>Sample figures</span>
      </div>
      <ol className="mt-3 flex items-stretch gap-1.5">
        {s.journey.map((j, i) => {
          const o = reveal(t, MOMENTS.journey[i], MOMENTS.journey[i] + 350);
          return (
            <li key={j.label} className="flex min-w-0 flex-1 items-center gap-1.5" style={{ opacity: 0.15 + 0.85 * o }}>
              {i > 0 && <span className="shrink-0 text-[14px]" style={{ color: ACCENT }} aria-hidden>→</span>}
              <div className="min-w-0 flex-1 rounded-xl px-2.5 py-2" style={{ background: "#f7f5fd", border: `1px solid ${LINE}` }}>
                <p className="truncate text-[10.5px]" style={{ color: MUTED }}>{j.label}</p>
                <p className={`${narrow ? "text-[18px]" : "text-[22px]"} font-semibold leading-tight`}>{j.value}</p>
                <p className="truncate text-[9.5px]" style={{ color: MUTED }}>{j.source}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex min-h-0 flex-1 flex-col rounded-xl p-3" style={{ border: `1px solid rgba(124,92,255,0.35)`, background: "#f8f6ff", opacity: rec, transform: `translateY(${(1 - rec) * 8}px)` }}>
        <Eyebrow>Recommendation</Eyebrow>
        <p className="mt-0.5 text-[14px] font-semibold">{s.recommendation.title}</p>
        <p className="mt-0.5 text-[11.5px] leading-snug" style={{ color: "#3d3760" }}>{s.recommendation.why}</p>
        <ul className={`mt-1.5 ${narrow ? "space-y-0.5" : "flex flex-wrap gap-1.5"}`}>
          {s.recommendation.evidence.map((e) => (
            <li key={e} className={`text-[10.5px] ${narrow ? "" : "rounded-md bg-white px-2 py-0.5"}`} style={{ color: MUTED, border: narrow ? undefined : `1px solid ${LINE}` }}>
              {narrow ? `· ${e}` : e}
            </li>
          ))}
        </ul>
        <div className="mt-auto flex items-center gap-2 pt-2">
          <span className="rounded-lg px-3 py-1.5 text-[12px] font-semibold" style={primary}>{s.recommendation.approve}</span>
          <span className="rounded-lg px-3 py-1.5 text-[12px] font-medium" style={{ border: `1px solid ${LINE}`, color: MUTED }}>Not now</span>
          {!narrow && <span className="ml-auto text-[10.5px]" style={{ color: MUTED }}>Nothing changes until you approve.</span>}
        </div>
      </div>
    </div>
  );
}

/** The closing question, with the call to action drawn where the live page puts a real button. */
export const INVITE_BUTTON_HEIGHT = 50;
function InviteCard({ drawButton }: { drawButton: boolean }) {
  return (
    <div className="relative h-full text-center">
      <div className="pointer-events-none absolute -inset-x-10 -inset-y-12 rounded-[40px]" style={{ background: "radial-gradient(ellipse at center, rgba(252,251,255,0.97) 45%, rgba(252,251,255,0) 72%)" }} />
      <p className="relative text-[24px] font-bold leading-tight tracking-[-0.02em]" style={{ color: INK }}>What could MAIRO create for your business?</p>
      {drawButton && (
        <div className="absolute bottom-0 left-0 right-0 flex justify-center" style={{ height: INVITE_BUTTON_HEIGHT }}>
          <span className="flex items-center gap-2 rounded-full px-6 text-[15px] font-semibold" style={{ ...primary, boxShadow: "0 14px 36px -14px rgba(91,63,217,0.8)" }}>
            See Your Free Plan <span aria-hidden>→</span>
          </span>
        </div>
      )}
    </div>
  );
}

export function StoryStage({ ex, t, layout, showCaption = true, drawInviteButton = true }: { ex: Example; t: number; layout: Layout; showCaption?: boolean; drawInviteButton?: boolean }) {
  const b = boxes(t, layout);
  const cam = camera(t);
  const narrow = layout === "narrow";
  const scene = sceneAt(t);
  const others = [0, 1, 2].filter((i) => i !== ex.selected);
  const feedMix = reveal(t, 13000, 13600);
  const thumbMix = reveal(t, 17000, 17500);
  const { w, h } = STAGE[layout];
  const captionO = reveal(t, scene.start, scene.start + 350) * (1 - reveal(t, scene.end - 250, scene.end));
  const cards = [b.p0, b.p1, b.p2];
  return (
    <div className="relative" style={{ width: w, height: h }}>
      <div className="absolute inset-0" style={{ perspective: 1600 }}>
        <div className="absolute inset-0" style={{ transform: `rotateX(${cam.rx}deg) rotateY(${cam.ry}deg) scale(${cam.s})`, transformStyle: "preserve-3d" }}>
          <Layer b={b.browser}><SiteBrowser ex={ex} t={t} narrow={narrow} /></Layer>
          <Layer b={b.input} className="overflow-visible"><StageInput ex={ex} t={t} compact={b.input.w < 400} /></Layer>
          {cards.map((box, i) => (
            <Layer key={i} b={box} className="overflow-visible"><BusinessCard ex={ex} which={i as 0 | 1 | 2} t={t} pill={box.h < 60} tiny={box.w < 140} /></Layer>
          ))}
          <Layer b={b.confirm}><ConfirmBar t={t} /></Layer>
          <Layer b={b.c0}><Concept ex={ex} i={others[0]} t={t} recommended={false} /></Layer>
          <Layer b={b.c2}><Concept ex={ex} i={others[1]} t={t} recommended={false} /></Layer>
          <Layer b={b.c1} style={{ borderRadius: 18 }}>
            {feedMix < 0.99 && <div className="absolute inset-0" style={{ opacity: 1 - feedMix }}><Concept ex={ex} i={ex.selected} t={t} recommended /></div>}
            {feedMix > 0.01 && thumbMix < 0.99 && <div className="absolute inset-0" style={{ opacity: feedMix * (1 - thumbMix) }}><FeedPreview ex={ex} /></div>}
            {thumbMix > 0.01 && <div className="absolute inset-0" style={{ opacity: thumbMix }}><AdThumb ex={ex} /></div>}
          </Layer>
          <Layer b={b.reason}><ReasonCard ex={ex} compact={narrow} /></Layer>
          <Layer b={b.story}><StoryPreview ex={ex} /></Layer>
          <Layer b={b.actions}><Actions t={t} cols={b.actions.w > 300 ? 2 : 1} /></Layer>
          <Layer b={b.edit}><EditCompare ex={ex} t={t} narrow={narrow} /></Layer>
          <Layer b={b.review}><ApprovalPanel ex={ex} t={t} narrow={narrow} /></Layer>
          <Layer b={b.dashboard}><ResultsBoard ex={ex} t={t} narrow={narrow} /></Layer>
          <Layer b={b.invite} className="overflow-visible"><InviteCard drawButton={drawInviteButton} /></Layer>
        </div>
      </div>
      {ex.type === "brands" && (
        <p aria-hidden className="pointer-events-none absolute right-3 top-3.5 rounded-full border px-2.5 py-1 text-[10.5px] font-medium" style={{ borderColor: LINE, background: "#fff", color: MUTED }}>
          One brand shown
        </p>
      )}
      {showCaption && (
        <p aria-hidden className="pointer-events-none absolute bottom-3 left-0 right-0 text-center text-[13px] font-semibold tracking-[0.01em] text-white" style={{ opacity: captionO }}>
          <span className="rounded-full px-3 py-1.5" style={{ background: "rgba(29,24,56,0.88)" }}>{scene.label}</span>
        </p>
      )}
    </div>
  );
}
