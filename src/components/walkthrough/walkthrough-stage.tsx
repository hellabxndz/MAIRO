import type { Example } from "@/lib/demo/examples";
import { reveal, STAGE, type Layout } from "@/lib/demo/timeline";
import { WALK_CHAPTERS, WALK_ONSCREEN, WALK_SCENES, innerTime, walkBoxes, walkCaptionAt, walkSceneAt } from "@/lib/demo/walkthrough";
import { Browser, ConceptCard, Dashboard, FeedPreview, InputPill, Layer, Review, StoryPreview, surface } from "@/components/hero-story/stage";

// One frame of the MAIRO demo, a pure function of time. The product scenes
// reuse the landing story's pieces (the same browser, concepts, previews,
// review and dashboard) and add the steps the short story skips: choosing a
// goal, facts checked and gaps asked, the plan's reasoning, editing a line,
// and the checks before launch — on their own inner clock (innerTime). The
// intro and the ending are drawn over them, with a slow camera push on each
// scene and its title as it starts. Everything shown is a sample business
// with sample figures.

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

const OBSIDIAN = "#07080D";

/** MAIRO's wordmark, spaced out. */
function Wordmark({ size }: { size: number }) {
  return <span className="font-semibold text-white" style={{ fontSize: size, letterSpacing: "0.42em", paddingLeft: "0.42em" }}>MAIRO</span>;
}

/** The three sample ads, fanned: the business's own concepts, labelled as samples. */
function Fan({ ex, t, from, narrow, small = false }: { ex: Example; t: number; from: number; narrow: boolean; small?: boolean }) {
  // On a phone the cards overlap, so the middle one stays readable at full size.
  const w = narrow ? (small ? 132 : 150) : small ? 132 : 170;
  const h = Math.round(w * 1.52);
  const gap = narrow ? (small ? 98 : 96) : small ? 150 : 196;
  return (
    <div className="relative" style={{ width: gap * 2 + w, height: h + 30 }}>
      {[0, 1, 2].map((i) => {
        const o = reveal(t, from + i * 350, from + i * 350 + 700);
        const rot = (i - 1) * (small ? 4 : 7);
        const lift = (1 - o) * 60 + (i === 1 ? 0 : 14) - Math.sin((t - from) / 900 + i) * 3 * o;
        return (
          <div key={i} className="absolute" style={{ left: i * gap, top: lift, width: w, height: h, opacity: o, transform: `rotate(${rot}deg) scale(${0.94 + 0.06 * o})`, zIndex: i === 1 ? 2 : 1 }}>
            <ConceptCard ex={ex} i={i} t={40000} selected={false} />
          </div>
        );
      })}
    </div>
  );
}

function Backdrop({ t }: { t: number }) {
  const drift = Math.sin(t / 2400) * 6;
  return (
    <div aria-hidden className="absolute inset-0" style={{ background: `radial-gradient(ellipse 60% 45% at ${50 + drift}% 38%, rgba(121,82,255,0.34), transparent 70%), radial-gradient(ellipse 45% 35% at ${78 - drift}% 88%, rgba(53,108,255,0.22), transparent 70%), ${OBSIDIAN}` }} />
  );
}

function Intro({ ex, t, narrow }: { ex: Example; t: number; narrow: boolean }) {
  const o = 1 - reveal(t, 7300, 8000);
  if (o <= 0.001) return null;
  const mark = reveal(t, 500, 1400);
  const meet = reveal(t, 4000, 4900);
  return (
    <div className="absolute inset-0 z-30" style={{ opacity: o }}>
      <Backdrop t={t} />
      <div className="absolute inset-x-0 flex justify-center" style={{ top: narrow ? 58 : 44, opacity: mark, transform: `translateY(${(1 - mark) * 10}px)` }}>
        <Wordmark size={narrow ? 15 : 17} />
      </div>
      <p className="absolute inset-x-0 text-center font-black text-white" style={{ top: narrow ? 92 : 84, fontSize: narrow ? 40 : 64, lineHeight: 1, letterSpacing: `${0.02 + 0.28 * (1 - meet)}em`, opacity: meet, transform: `scale(${1.06 - 0.06 * meet})`, textShadow: "0 0 40px rgba(121,82,255,0.55)" }}>
        {WALK_ONSCREEN.intro}
      </p>
      <div className="absolute inset-x-0 flex justify-center" style={{ top: narrow ? 200 : 182 }}>
        <Fan ex={ex} t={t} from={1300} narrow={narrow} />
      </div>
    </div>
  );
}

function Ending({ ex, t, narrow }: { ex: Example; t: number; narrow: boolean }) {
  const o = reveal(t, 64400, 65200);
  if (o <= 0.001) return null;
  const l1 = reveal(t, 65800, 66600);
  const l2 = reveal(t, 66800, 67600);
  const cta = reveal(t, 68600, 69400);
  const glow = 0.45 + 0.25 * Math.sin((t - 68600) / 420);
  return (
    <div className="absolute inset-0 z-30" style={{ opacity: o }}>
      <Backdrop t={t} />
      <div className="absolute inset-x-0 flex justify-center" style={{ top: narrow ? 52 : 34 }}>
        <Wordmark size={narrow ? 14 : 15} />
      </div>
      <div className="absolute inset-x-0 text-center font-black leading-[1.05] tracking-[-0.02em] text-white" style={{ top: narrow ? 86 : 70, fontSize: narrow ? 26 : 38 }}>
        <p style={{ opacity: l1, transform: `translateY(${(1 - l1) * 12}px)` }}>{WALK_ONSCREEN.endLines[0]}</p>
        <p style={{ opacity: l2, transform: `translateY(${(1 - l2) * 12}px)`, backgroundImage: "linear-gradient(90deg,#9b7bff,#356CFF)", WebkitBackgroundClip: "text", color: "transparent" }}>{WALK_ONSCREEN.endLines[1]}</p>
      </div>
      <div className="absolute inset-x-0 flex justify-center" style={{ top: narrow ? 168 : 172 }}>
        <Fan ex={ex} t={t} from={65400} narrow={narrow} small />
      </div>
      <div className="absolute inset-x-0 flex flex-col items-center" style={{ top: narrow ? 412 : 400, opacity: cta, transform: `scale(${0.96 + 0.04 * cta})` }}>
        <span className="rounded-full px-6 py-3 text-[14px] font-black tracking-[0.08em] text-white" style={{ background: "linear-gradient(90deg,#7952FF,#356CFF)", boxShadow: `0 0 ${36 + 20 * glow}px rgba(121,82,255,${glow})` }}>{WALK_ONSCREEN.cta}</span>
        <span className="mt-2 text-[11.5px] text-white/60">Free to start. Nothing runs without your approval.</span>
      </div>
    </div>
  );
}

/** The scene's title as it starts: "02 · Your business". */
function SceneTitle({ t, narrow }: { t: number; narrow: boolean }) {
  const scene = walkSceneAt(t);
  const n = WALK_SCENES.indexOf(scene);
  if (scene.id === "intro" || scene.id === "ending") return null;
  const o = reveal(t, scene.start + 200, scene.start + 600) * (1 - reveal(t, scene.start + 2600, scene.start + 3000));
  if (o <= 0.01) return null;
  return (
    <p className="absolute right-3 top-3 z-20 rounded-full border border-white/15 bg-black/60 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white" style={{ opacity: o }}>
      <span className="text-[#a78bfa]">{String(n).padStart(2, "0")}</span> · {narrow ? WALK_CHAPTERS[n].label : scene.label}
    </p>
  );
}

export function WalkthroughStage({ ex, t: demoT, layout, showCaption = true }: { ex: Example; t: number; layout: Layout; showCaption?: boolean }) {
  const b = walkBoxes(demoT, layout);
  // The product screens run on their own clock; the intro, ending, titles and captions on the demo's.
  const t = innerTime(demoT);
  const narrow = layout === "narrow";
  const { w, h } = STAGE[layout];
  const others = [0, 1, 2].filter((i) => i !== ex.selected);
  const hook = editedHookAt(ex, t);
  const feedMix = reveal(t, 34000, 34800);
  const cap = walkCaptionAt(demoT);
  const capO = reveal(demoT, cap.start, cap.start + 300) * (1 - reveal(demoT, cap.end - 200, cap.end));
  // A slow push-in across each product scene.
  const scene = walkSceneAt(demoT);
  const push = 1 + 0.03 * reveal(demoT, scene.start, scene.end);
  return (
    <div className="relative overflow-hidden" style={{ width: w, height: h }}>
      <div className="absolute inset-0" style={{ transform: `scale(${push})`, transformOrigin: "50% 45%" }}>
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
      </div>
      <Intro ex={ex} t={demoT} narrow={narrow} />
      <Ending ex={ex} t={demoT} narrow={narrow} />
      <SceneTitle t={demoT} narrow={narrow} />
      {showCaption && (
        <p aria-hidden className={`pointer-events-none absolute bottom-3 left-4 right-4 z-40 text-center font-medium leading-snug text-white ${narrow ? "text-[12px]" : "text-[13px]"}`} style={{ opacity: capO }}>
          <span className="box-decoration-clone rounded-md bg-black/65 px-2.5 py-1">{cap.text}</span>
        </p>
      )}
    </div>
  );
}
