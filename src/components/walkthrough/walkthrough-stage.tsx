import type { Example } from "@/lib/demo/examples";
import { reveal, STAGE, type Layout } from "@/lib/demo/timeline";
import { walkBoxes, walkCaptionAt } from "@/lib/demo/walkthrough";
import { Browser, ConceptCard, Dashboard, FeedPreview, InputPill, Layer, Review, StoryPreview, surface } from "@/components/hero-story/stage";

// One frame of the 60-second walkthrough, a pure function of time. It reuses
// the landing story's pieces (the same browser, concepts, previews, review
// and dashboard) and adds the steps the short story skips: choosing a goal,
// facts checked and gaps asked, the plan's reasoning, editing a line, and
// the checks before launch. Everything shown is a sample business with
// sample figures.

const GOALS = ["Sell more online", "Get more qualified leads", "Get more bookings", "Not sure yet"];
const PICKED = 1;

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex h-full flex-col rounded-2xl p-4 ${className}`} style={surface}>
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#c4b5fd]">{title}</p>
      {children}
    </div>
  );
}

function GoalPicker({ t }: { t: number }) {
  const hover = t >= 5200;
  const chosen = t >= 5900;
  return (
    <Panel title="Your goal">
      <p className="mt-1 text-[15px] font-semibold leading-snug text-white">What should your first campaign get you?</p>
      <ul className="mt-3 space-y-2">
        {GOALS.map((g, i) => {
          const on = i === PICKED && hover;
          return (
            <li key={g} className="flex items-center justify-between rounded-xl px-3 py-2.5 text-[13px]" style={{ background: on ? "rgba(124,92,255,0.22)" : "rgba(255,255,255,0.05)", border: `1px solid ${on ? "rgba(167,139,250,0.7)" : "transparent"}`, color: on ? "#fff" : "rgba(255,255,255,0.8)" }}>
              {g}
              {i === PICKED && chosen && <span className="text-[12px] font-semibold text-[#6fe0b4]">✓</span>}
            </li>
          );
        })}
      </ul>
      <span className="mt-auto rounded-xl py-2 text-center text-[12.5px] font-semibold text-white" style={{ background: "linear-gradient(90deg,#5b6cff,#8b4dfb)", opacity: chosen ? 1 : 0.4, transform: t >= 7000 && t < 7300 ? "scale(0.96)" : "none" }}>
        Continue
      </span>
    </Panel>
  );
}

type Chip = { text: string; tone: "site" | "ask" | "you" };
const CHIP: Record<Chip["tone"], string> = {
  site: "bg-emerald-400/15 text-[#6fe0b4]",
  ask: "bg-amber-300/15 text-amber-200",
  you: "bg-[#7c5cff]/25 text-[#d6ccff]",
};

function FactsPanel({ ex, t }: { ex: Example; t: number }) {
  const area = ex.profile.location.split(" and ")[0];
  const asked = t >= 12000;
  const answered = t >= 14200;
  const offerOk = t >= 15600;
  const rows: { k: string; v: string; chip: Chip; at: number; options?: string[] }[] = [
    { k: "What you offer", v: ex.site.headline, chip: { text: "From your website", tone: "site" }, at: 8800 },
    { k: "Where you work", v: area, chip: { text: "From your website", tone: "site" }, at: 9400 },
    { k: "Trust", v: ex.site.sub, chip: { text: "From your website", tone: "site" }, at: 10000 },
    {
      k: ex.unknown.question,
      v: answered ? ex.unknown.answer : "",
      chip: answered ? { text: "Confirmed by you", tone: "you" } : { text: "Not on your website — MAIRO asks", tone: "ask" },
      at: 12000,
      options: answered ? undefined : ["Within 5 miles", ex.unknown.answer, "Within 30 miles"],
    },
    { k: "Current offer", v: ex.concepts[2].hook.replace(/\.$/, ""), chip: offerOk ? { text: "Confirmed by you", tone: "you" } : { text: "Found — still current?", tone: "ask" }, at: 13000 },
  ];
  return (
    <Panel title="What MAIRO found">
      <ul className="mt-2 space-y-2">
        {rows.map((r) => {
          const o = reveal(t, r.at, r.at + 400);
          if (o <= 0.01) return null;
          const highlight = r.at === 12000 && asked && !answered;
          return (
            <li key={r.k} className="rounded-xl px-3 py-2" style={{ opacity: o, background: highlight ? "rgba(252,211,77,0.08)" : "rgba(255,255,255,0.05)", border: `1px solid ${highlight ? "rgba(252,211,77,0.35)" : "transparent"}` }}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10.5px] text-white/55">{r.k}</p>
                <span className={`shrink-0 rounded-full px-1.5 py-[1px] text-[9.5px] font-semibold ${CHIP[r.chip.tone]}`}>{r.chip.text}</span>
              </div>
              {r.v && <p className="mt-0.5 text-[12.5px] leading-snug text-white">{r.v}</p>}
              {r.options && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {r.options.map((x) => (
                    <span key={x} className="rounded-full px-2 py-0.5 text-[10.5px]" style={{ background: x === ex.unknown.answer && t >= 13600 ? "rgba(124,92,255,0.45)" : "rgba(255,255,255,0.08)", color: "#fff" }}>{x}</span>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function PlanCard({ ex, t, narrow }: { ex: Example; t: number; narrow: boolean }) {
  const rows: { k: string; v: string; why?: string; at: number; tag?: string }[] = [
    { k: "Where the ads run", v: ex.plan.channel, at: 17800 },
    { k: "What it's for", v: ex.plan.objective, at: 18700 },
    { k: "Who sees it", v: ex.plan.audience, why: ex.plan.why, at: 19800 },
    { k: "Budget", v: ex.plan.budget, why: "You set the real amount. Nothing is spent until you approve a campaign.", at: 22600, tag: "Example" },
  ];
  return (
    <Panel title="Your free plan — draft">
      <p className="mt-0.5 text-[16px] font-semibold text-white">{ex.name}</p>
      <ul className={`mt-3 grid gap-2.5 ${narrow ? "" : "grid-cols-2"}`}>
        {rows.map((r) => {
          const o = reveal(t, r.at, r.at + 450);
          const whyO = r.why ? reveal(t, r.at + 1800, r.at + 2300) : 0;
          return (
            <li key={r.k} className="rounded-xl bg-white/[0.05] px-3 py-2.5" style={{ opacity: 0.2 + 0.8 * o }}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10.5px] uppercase tracking-[0.12em] text-white/50">{r.k}</p>
                {r.tag && o > 0.5 && <span className="rounded-full border border-amber-300/40 bg-amber-300/10 px-1.5 text-[9.5px] text-amber-200">{r.tag}</span>}
              </div>
              <p className="mt-0.5 text-[13px] leading-snug text-white">{o > 0.05 ? r.v : "…"}</p>
              {r.why && whyO > 0.01 && <p className="mt-1 text-[11px] leading-snug text-[#d6ccff]" style={{ opacity: whyO }}>Why: {r.why}</p>}
            </li>
          );
        })}
      </ul>
      <p className="mt-auto pt-2 text-[10.5px] text-white/50">A plan, not a forecast — MAIRO doesn&rsquo;t promise a number of leads.</p>
    </Panel>
  );
}

/** The opening line, rewritten by the owner: the old one is kept as a version. */
export function editedHookAt(ex: Example, t: number): string {
  const from = ex.concepts[ex.selected].hook;
  const to = ex.editedHook;
  if (t < 32600) return from;
  // Keep the shared start, retype the rest.
  let k = 0;
  while (k < from.length && k < to.length && from[k] === to[k]) k++;
  const typed = Math.floor((to.length - k) * reveal(t, 32600, 33900));
  return to.slice(0, k + typed);
}

function HookEditor({ ex, t }: { ex: Example; t: number }) {
  const text = editedHookAt(ex, t);
  const editing = t >= 32000 && t < 34000;
  const done = t >= 34000;
  return (
    <Panel title="Opening line">
      <div className="mt-2 rounded-xl border px-3 py-2 text-[13.5px] font-semibold leading-snug text-white" style={{ borderColor: editing ? "rgba(167,139,250,0.8)" : "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }}>
        {text}
        {editing && Math.floor(t / 450) % 2 === 0 && <span className="ml-[1px] inline-block h-[14px] w-[1.5px] translate-y-[2px] bg-white" />}
      </div>
      {done && (
        <>
          <span className="mt-2 self-start rounded-full bg-[#7c5cff]/25 px-2 py-0.5 text-[10.5px] font-semibold text-[#d6ccff]">Edited by you</span>
          <p className="mt-1.5 text-[10.5px] leading-snug text-white/50">Version 2. The original line is kept, and you can go back to it.</p>
        </>
      )}
    </Panel>
  );
}

function ReadinessPanel({ ex, t, compact }: { ex: Example; t: number; compact: boolean }) {
  const approvedAt = 46300;
  const items: { label: string; state: "done" | "needed" | "optional"; detail?: string }[] = ex.readiness.map((r) => ({ label: r.label, state: r.label === "Creative approved" ? (t >= approvedAt ? "done" : "needed") : r.state }));
  return (
    <Panel title="Ready to launch?">
      <ul className="mt-2 space-y-1.5">
        {items.map((r, i) => {
          const o = reveal(t, 38800 + i * 600, 39200 + i * 600);
          const mark = r.state === "done" ? "✓" : r.state === "optional" ? "–" : "•";
          const color = r.state === "done" ? "#6fe0b4" : r.state === "optional" ? "rgba(255,255,255,0.45)" : "#fcd34d";
          return (
            <li key={r.label} className="flex items-center gap-2.5 rounded-xl bg-white/[0.04] px-3 py-2 text-[12.5px] text-white" style={{ opacity: 0.15 + 0.85 * o }}>
              <span className="w-3 text-center font-bold" style={{ color }}>{mark}</span>
              <span className="flex-1">{r.label}</span>
              <span className="text-[10px] text-white/50">{r.state === "optional" ? "Optional" : r.state === "needed" ? "Waiting for you" : ""}</span>
            </li>
          );
        })}
      </ul>
      {!compact && (
        <div className="mt-2.5 rounded-xl border border-white/10 px-3 py-2 text-[11.5px]" style={{ opacity: reveal(t, 42000, 42500) }}>
          <p className="flex items-center gap-1.5 text-white"><span className="h-2 w-2 rounded-full bg-[#34d399]" /> Meta ad account connected</p>
          <p className="mt-0.5 text-white/55">{ex.name}&rsquo;s own account. You can disconnect it at any time.</p>
        </div>
      )}
    </Panel>
  );
}

function EndCard() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 rounded-2xl px-5 text-center" style={surface}>
      <p className="text-[20px] font-bold leading-tight tracking-[-0.02em] text-white">See it for your business</p>
      <p className="text-[12px] leading-snug text-white/65">A sample business with sample figures. What MAIRO makes for you depends on your business — and nothing runs without your approval.</p>
    </div>
  );
}

export function WalkthroughStage({ ex, t, layout, showCaption = true }: { ex: Example; t: number; layout: Layout; showCaption?: boolean }) {
  const b = walkBoxes(t, layout);
  const narrow = layout === "narrow";
  const { w, h } = STAGE[layout];
  const others = [0, 1, 2].filter((i) => i !== ex.selected);
  const hook = editedHookAt(ex, t);
  const feedMix = reveal(t, 34000, 34800);
  const cap = walkCaptionAt(t);
  const capO = reveal(t, cap.start, cap.start + 300) * (1 - reveal(t, cap.end - 200, cap.end));
  return (
    <div className="relative" style={{ width: w, height: h }}>
      {/* Map the walkthrough's clock onto the shared pieces' own timings. */}
      <Layer b={b.browser}><Browser ex={ex} t={t} narrow={narrow} marks={{ start: 8600, end: 16000 }} /></Layer>
      <Layer b={b.input}><InputPill ex={ex} t={t} /></Layer>
      <Layer b={b.goal}><GoalPicker t={t} /></Layer>
      <Layer b={b.facts}><FactsPanel ex={ex} t={t} /></Layer>
      <Layer b={b.plan}><PlanCard ex={ex} t={t} narrow={narrow} /></Layer>
      <Layer b={b.c0}><ConceptCard ex={ex} i={others[0]} t={t} selected={false} /></Layer>
      <Layer b={b.c2}><ConceptCard ex={ex} i={others[1]} t={t} selected={false} /></Layer>
      <Layer b={b.c1} style={{ borderRadius: 18 }}>
        <div className="absolute inset-0" style={{ opacity: 1 - feedMix }}>
          <ConceptCard ex={ex} i={ex.selected} t={t} selected ringAt={30000} hook={hook} />
          {t >= 28400 && t < 31000 && <span className="absolute bottom-12 left-3 rounded-full bg-[#7c5cff] px-2 py-0.5 text-[10px] font-semibold text-white">Recommended first test</span>}
        </div>
        {feedMix > 0.01 && <div className="absolute inset-0" style={{ opacity: feedMix }}><FeedPreview ex={ex} hook={hook} /></div>}
      </Layer>
      <Layer b={b.editor}><HookEditor ex={ex} t={t} /></Layer>
      <Layer b={b.story}><StoryPreview ex={ex} hook={hook} /></Layer>
      <Layer b={b.readiness}><ReadinessPanel ex={ex} t={t} compact={narrow} /></Layer>
      <Layer b={b.review}><Review ex={ex} t={t} compact={narrow} pressAt={46000} /></Layer>
      <Layer b={b.dashboard}><Dashboard ex={ex} t={t} narrow={narrow} times={{ metrics: 50000, lead: 52200, move: 55200, next: 57200 }} /></Layer>
      <Layer b={b.end}><EndCard /></Layer>
      {showCaption && (
        <p aria-hidden className={`pointer-events-none absolute bottom-3 left-4 right-4 text-center font-medium leading-snug text-white ${narrow ? "text-[12px]" : "text-[13px]"}`} style={{ opacity: capO }}>
          <span className="box-decoration-clone rounded-md bg-black/65 px-2.5 py-1">{cap.text}</span>
        </p>
      )}
    </div>
  );
}
