"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

// The hero, as something you operate rather than something you look at.
//
// Everything here is layered on top of the render: the scene plate stays
// exactly what it is, and this adds the parts that respond — depth that
// follows the cursor, a core that reports what it is doing, beams that fire
// between a capability and the core when you reach for it, and a command line
// that takes a sentence and carries it into sign-up.
//
// Three rules held throughout:
//
//   Nothing invented. The readouts name what the system does; none of them
//   report a volume, a rate or a result, because there are no customers yet and
//   a hero that streams made-up throughput is a lie told at 60fps.
//
//   No WebGL. Transforms and opacity only. This product spent weeks chasing
//   black squares that came from a WebGL scene, and a parallax effect is not
//   worth reopening that.
//
//   Pointer is an enhancement. Every state reachable by hover is also reached
//   by focus, by tap, and by the idle cycle, so a phone and a keyboard get the
//   same hero rather than a dead one.

/* ------------------------------------------------------------------ motion */

/** Reduced motion, read the way React wants it read — no setState in an effect. */
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window === "undefined") return () => {};
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

/* ----------------------------------------------------------------- context */

export type CapabilityId = "creative" | "campaign" | "audience" | "optimize";

export const CAPABILITIES: Record<CapabilityId, { label: string; line: string }> = {
  creative: { label: "Creative engine", line: "Writing concepts, hooks and variations" },
  campaign: { label: "Campaign builder", line: "Assembling campaign, ad set and ad" },
  audience: { label: "Audience model", line: "Matching who is most likely to buy" },
  optimize: { label: "Optimizer", line: "Reading results, proposing the next move" },
};

const ORDER: CapabilityId[] = ["creative", "campaign", "audience", "optimize"];

type Ctx = {
  active: CapabilityId;
  setActive: (id: CapabilityId | null) => void;
  register: (id: CapabilityId, el: HTMLElement | null) => void;
  stageRef: React.RefObject<HTMLDivElement | null>;
  coreRef: React.RefObject<HTMLDivElement | null>;
  held: boolean;
};

const StageCtx = createContext<Ctx | null>(null);

function useStage() {
  const ctx = useContext(StageCtx);
  if (!ctx) throw new Error("Hero stage components must be rendered inside <HeroStage>");
  return ctx;
}

/* ------------------------------------------------------------------- stage */

export function HeroStage({ children }: { children: ReactNode }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);
  const slots = useRef(new Map<CapabilityId, HTMLElement>());
  const reduced = usePrefersReducedMotion();

  // `held` means a person is pointing at something, which suspends the idle
  // cycle. Without it the readout would keep rotating underneath their cursor
  // and the panel they are reading would go dark while they read it.
  const [held, setHeld] = useState(false);
  const [active, setActiveState] = useState<CapabilityId>("creative");

  const setActive = useCallback((id: CapabilityId | null) => {
    if (id === null) {
      setHeld(false);
      return;
    }
    setHeld(true);
    setActiveState(id);
  }, []);

  const register = useCallback((id: CapabilityId, el: HTMLElement | null) => {
    if (el) slots.current.set(id, el);
    else slots.current.delete(id);
  }, []);

  // The idle cycle. This is what makes the thing look alive before anyone has
  // touched it — and it is the only "activity" on the page, deliberately, so it
  // reads as one system thinking rather than six widgets animating.
  useEffect(() => {
    if (held || reduced) return;
    const t = setInterval(() => {
      setActiveState((cur) => ORDER[(ORDER.indexOf(cur) + 1) % ORDER.length]);
    }, 3400);
    return () => clearInterval(t);
  }, [held, reduced]);

  // Pointer depth.
  //
  // Written to CSS custom properties from a rAF rather than to React state.
  // State here would re-render the whole hero — four cards, the plate, the HUD
  // — on every mousemove, which is the classic way a parallax hero ends up
  // costing more than the rest of the page put together. This way the browser
  // moves the layers on the compositor and React never hears about it.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || reduced) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    let frame = 0;
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;

    const onMove = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width) * 2 - 1;
      ty = ((e.clientY - r.top) / r.height) * 2 - 1;
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const tick = () => {
      // Ease toward the pointer instead of tracking it exactly, so the scene
      // has some mass and does not twitch.
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      stage.style.setProperty("--mx", cx.toFixed(4));
      stage.style.setProperty("--my", cy.toFixed(4));
      frame =
        Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001
          ? requestAnimationFrame(tick)
          : 0;
    };

    const onLeave = () => {
      tx = 0;
      ty = 0;
      if (!frame) frame = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    stage.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [reduced]);

  return (
    <StageCtx.Provider value={{ active, setActive, register, stageRef, coreRef, held }}>
      <div
        ref={stageRef}
        className="mairo-stage relative"
        style={{ ["--mx" as string]: 0, ["--my" as string]: 0 }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setActive(null);
        }}
      >
        {children}
      </div>

      <style>{`
        /* Depth. Three planes, moving at three rates — the plate least because
           it is furthest away, the HUD most because it is nearest. */
        .mairo-par-scene {
          transform: translate3d(calc(var(--mx) * -10px), calc(var(--my) * -6px), 0) scale(1.02);
          transition: transform 120ms linear;
          will-change: transform;
        }
        .mairo-par-card {
          transform: translate3d(calc(var(--mx) * 9px), calc(var(--my) * 6px), 0);
          transition: transform 160ms linear;
        }
        .mairo-par-hud {
          transform: translate3d(calc(var(--mx) * 18px), calc(var(--my) * 12px), 0);
          transition: transform 140ms linear;
        }

        .mairo-spin-slow { animation: mairo-hud-spin 26s linear infinite; }
        .mairo-spin-rev  { animation: mairo-hud-spin 34s linear infinite reverse; }
        @keyframes mairo-hud-spin { to { transform: rotate(360deg); } }

        .mairo-sweep { animation: mairo-sweep 7s cubic-bezier(0.5,0,0.5,1) infinite; }
        @keyframes mairo-sweep {
          0%, 68%  { transform: translateY(-140%); opacity: 0; }
          72%      { opacity: 0.9; }
          100%     { transform: translateY(240%); opacity: 0; }
        }

        .mairo-beam { stroke-dasharray: 1; stroke-dashoffset: 1; animation: mairo-beam 620ms var(--ease-mairo) forwards; }
        @keyframes mairo-beam { to { stroke-dashoffset: 0; } }

        @media (prefers-reduced-motion: reduce) {
          .mairo-par-scene, .mairo-par-card, .mairo-par-hud { transform: none; }
          .mairo-spin-slow, .mairo-spin-rev, .mairo-sweep, .mairo-beam { animation: none; }
          .mairo-beam { stroke-dashoffset: 0; }
        }
      `}</style>
    </StageCtx.Provider>
  );
}

/* -------------------------------------------------------------------- slot */

/**
 * The wrapper that makes a capability card live.
 *
 * The card inside stays a server component — this only adds the reach: hover,
 * focus and tap all select the same capability, so the core reacts the same way
 * whether you have a mouse, a keyboard or a thumb.
 */
export function HeroSlot({ id, children }: { id: CapabilityId; children: ReactNode }) {
  const { active, setActive, register, held } = useStage();
  const ref = useRef<HTMLDivElement>(null);
  const on = held && active === id;

  useEffect(() => {
    register(id, ref.current);
    return () => register(id, null);
  }, [id, register]);

  return (
    <div
      ref={ref}
      data-capability={id}
      className="mairo-par-card relative"
      onPointerEnter={() => setActive(id)}
      onPointerLeave={() => setActive(null)}
      onFocusCapture={() => setActive(id)}
    >
      {/* The ignition. An overlay rather than a border change, so the edge can
          be feathered — a hard border lighting up reads as a glitch. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[var(--radius-card)] transition-opacity duration-500 [transition-timing-function:var(--ease-mairo)]"
        style={{
          opacity: on ? 1 : 0,
          boxShadow:
            "0 0 0 1px rgba(122,170,255,0.55), 0 0 30px rgba(61,125,255,0.45), inset 0 0 40px rgba(61,125,255,0.14)",
        }}
      />
      <div
        className="transition-transform duration-500 [transition-timing-function:var(--ease-mairo)]"
        style={{ transform: on ? "translateY(-3px)" : "none" }}
      >
        {children}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- HUD */

/** Where the core is, so the beams know what to aim at. */
export function HeroCoreAnchor({ className = "" }: { className?: string }) {
  const { coreRef } = useStage();
  return <div ref={coreRef} aria-hidden className={`pointer-events-none ${className}`} />;
}

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/\\<>-_=+*";

/**
 * The readout over the core.
 *
 * It says which part of the system is working and what that part does, and
 * nothing else. No counters, no rates, no totals — the moment a hero starts
 * showing "12,480 ads generated" for a product with no customers, everything
 * else on the page stops being believable too.
 */
export function HeroCoreHud() {
  const { active } = useStage();
  const reduced = usePrefersReducedMotion();
  const target = CAPABILITIES[active].label.toUpperCase();
  const [shown, setShown] = useState(target);

  // The decode. Resolves left to right over ~360ms, which is long enough to
  // register as the machine settling on an answer and short enough not to make
  // anyone wait to read it.
  // No setState in the effect body: the reduced-motion case is derived at
  // render (see `text` below) and the animated case only ever sets state from
  // the interval callback, which is what effects are actually for.
  useEffect(() => {
    if (reduced) return;
    let step = 0;
    const total = target.length;
    const t = setInterval(() => {
      step += 1;
      if (step > total) {
        setShown(target);
        clearInterval(t);
        return;
      }
      setShown(
        target
          .slice(0, step)
          .concat(
            Array.from({ length: total - step }, () =>
              target[step] === " " ? " " : GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
            ).join(""),
          ),
      );
    }, 360 / Math.max(1, total));
    return () => clearInterval(t);
  }, [target, reduced]);

  // Reduced motion gets the settled label; everyone else gets the decode.
  const text = reduced ? target : shown;

  return (
    <div className="mairo-par-hud pointer-events-none absolute inset-0">
      {/* Placed on the sphere, not centred in the column. The column also holds
          the spacer that reserves room for the plate, so centring in it put the
          readout well below the core — out on the floor of the render. */}
      <div className="absolute left-1/2 top-[42%] aspect-square w-[62%] -translate-x-1/2 -translate-y-1/2 lg:top-[47%] lg:w-[66%]">
        {/* Two tick rings, turning opposite ways. */}
        <svg viewBox="0 0 200 200" className="mairo-spin-slow absolute inset-0 h-full w-full" aria-hidden>
          <circle
            cx="100" cy="100" r="96" fill="none"
            stroke="rgba(150,195,255,0.4)" strokeWidth="0.7"
            strokeDasharray="1.5 7" strokeLinecap="round"
          />
        </svg>
        <svg viewBox="0 0 200 200" className="mairo-spin-rev absolute inset-[7%] h-auto w-auto" aria-hidden>
          <circle
            cx="100" cy="100" r="96" fill="none"
            stroke="rgba(180,150,255,0.34)" strokeWidth="0.7"
            strokeDasharray="14 26" strokeLinecap="round"
          />
          {[0, 90, 180, 270].map((a) => (
            <path
              key={a}
              d="M100 4 m-13 0 a13 13 0 0 1 26 0"
              fill="none"
              stroke="rgba(200,220,255,0.75)"
              strokeWidth="1.3"
              strokeLinecap="round"
              transform={`rotate(${a} 100 100)`}
            />
          ))}
        </svg>

        {/* The readout, under the baked wordmark. */}
        <div className="absolute inset-x-0 top-[68%] text-center">
          <p
            className="font-mono text-[9px] uppercase tracking-[0.3em] text-[#dceaff] sm:text-[10px]"
            style={{ textShadow: "0 1px 10px rgba(3,7,20,1), 0 0 22px rgba(3,7,20,0.9)" }}
          >
            {text}
          </p>
          {/* Lighter than the muted token, and on a scrim. This line sits on the
              brightest part of the render — lit particles, not page background
              — and at #8fb4ee it was under 3:1 against them. */}
          <p
            className="mx-auto mt-1.5 inline-block max-w-[86%] rounded-full px-3 py-1 text-[10px] leading-snug text-[#cfe2ff] sm:text-[11px]"
            style={{
              background: "rgba(3,7,20,0.55)",
              textShadow: "0 1px 10px rgba(3,7,20,1)",
            }}
          >
            {CAPABILITIES[active].line}
          </p>
        </div>
      </div>
      {/* A holographic pass down the core every few seconds. */}
      <span
        aria-hidden
        className="mairo-sweep pointer-events-none absolute inset-x-[18%] top-0 h-[22%] rounded-full"
        style={{
          background:
            "linear-gradient(to bottom, transparent, rgba(160,205,255,0.16), transparent)",
        }}
      />
      <span className="sr-only" aria-live="polite">
        {CAPABILITIES[active].label}: {CAPABILITIES[active].line}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------- beams */

/**
 * The line that fires from a card to the core when you reach for it.
 *
 * Measured from the live DOM rather than hardcoded, because the cards move with
 * the grid at every breakpoint and a hand-written path would be right at
 * exactly one width.
 */
export function HeroBeams() {
  const { active, held, stageRef, coreRef } = useStage();
  const [path, setPath] = useState<string | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  // Measured in a frame rather than in the effect body. Two reasons: state set
  // from a callback is what an effect is for, and the card has a transform
  // transition on it — measuring synchronously catches it mid-flight and the
  // beam lands a few pixels off its edge.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const stage = stageRef.current;
      const core = coreRef.current;
      const card = stage?.querySelector<HTMLElement>(`[data-capability="${active}"]`);
      if (!held || !stage || !core || !card) {
        setPath(null);
        return;
      }

      const s = stage.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      const k = core.getBoundingClientRect();
      // Below lg the cards sit under the core rather than beside it, so a beam
      // would run straight down the page through the copy.
      if (s.width < 1024) {
        setPath(null);
        return;
      }

      const kx = k.left - s.left + k.width / 2;
      const ky = k.top - s.top + k.height / 2;
      const fromLeft = c.left - s.left + c.width / 2 < kx;
      const x = c.left - s.left + (fromLeft ? c.width : 0);
      const y = c.top - s.top + c.height / 2;
      // A single control point pulled off the midline, which gives the same
      // lazy arc the render's own light streams have.
      const mx = (x + kx) / 2;
      const my = (y + ky) / 2 + (y < ky ? -40 : 40);

      setBox({ w: s.width, h: s.height });
      setPath(`M${x} ${y} Q${mx} ${my} ${kx} ${ky}`);
    });
    return () => cancelAnimationFrame(frame);
  }, [active, held, stageRef, coreRef]);

  if (!path) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 -z-[5] hidden h-full w-full lg:block"
      viewBox={`0 0 ${box.w} ${box.h}`}
      aria-hidden
    >
      <defs>
        <linearGradient id="hero-beam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6aa6ff" stopOpacity="0.05" />
          <stop offset="45%" stopColor="#bcd9ff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#c8b8ff" stopOpacity="0.5" />
        </linearGradient>
      </defs>
      <path
        key={path}
        d={path}
        fill="none"
        stroke="url(#hero-beam)"
        strokeWidth="9"
        strokeOpacity="0.14"
        strokeLinecap="round"
        pathLength={1}
        className="mairo-beam"
      />
      <path
        key={`${path}-core`}
        d={path}
        fill="none"
        stroke="url(#hero-beam)"
        strokeWidth="1.5"
        strokeLinecap="round"
        pathLength={1}
        className="mairo-beam"
      />
    </svg>
  );
}

/* ----------------------------------------------------------------- command */

// Things the product genuinely does, phrased the way somebody would actually
// ask. Nothing here promises a number.
const PROMPTS = [
  "Get more customers into my dental clinic",
  "Turn this photo of my product into an ad",
  "Find people most likely to book a table",
  "Tell me why my cost per click went up",
  "Run the same campaign on TikTok as well",
];

/**
 * The command line.
 *
 * The one genuinely interactive thing on the page, and it is not a toy: what
 * gets typed here travels to sign-up as `intent`, so the first screen after
 * registering can open on the thing the person actually came to do instead of
 * an empty dashboard.
 */
export function HeroCommand() {
  const router = useRouter();
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [typed, setTyped] = useState("");
  const [idx, setIdx] = useState(0);

  // The placeholder types itself, holds, then clears. Paused whenever the field
  // is in use, because a placeholder animating under something you are typing
  // is just noise.
  useEffect(() => {
    // Paused states are derived at render (see `placeholder`), so this never
    // sets state outside the interval callback.
    if (reduced || focused || value) return;
    const full = PROMPTS[idx];
    let i = 0;
    let hold = 0;
    const t = setInterval(() => {
      if (i < full.length) {
        i += 1;
        setTyped(full.slice(0, i));
      } else if (hold < 26) {
        hold += 1;
      } else {
        clearInterval(t);
        setIdx((n) => (n + 1) % PROMPTS.length);
      }
    }, 34);
    return () => clearInterval(t);
  }, [idx, reduced, focused, value]);

  const placeholder = focused
    ? "Tell Mairo what you sell…"
    : reduced || value
      ? PROMPTS[idx]
      : typed;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    router.push(v ? `/sign-up?intent=${encodeURIComponent(v.slice(0, 200))}` : "/sign-up");
  };

  return (
    <form onSubmit={submit} className="mairo-par-card mx-auto mt-6 w-full max-w-xl">
      <div
        className="flex items-center gap-2 rounded-full border px-2 py-2 pl-4 transition-all duration-500 [transition-timing-function:var(--ease-mairo)]"
        style={{
          borderColor: focused ? "rgba(122,170,255,0.6)" : "var(--mairo-line)",
          background: "rgba(6,11,26,0.72)",
          boxShadow: focused ? "0 0 32px rgba(61,125,255,0.3)" : "none",
        }}
      >
        <span aria-hidden className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-bright/60" />
          <span className="relative h-1.5 w-1.5 rounded-full bg-blue-bright" />
        </span>

        <label htmlFor="mairo-command" className="sr-only">
          Tell MAIRO what you want to advertise
        </label>
        <input
          id="mairo-command"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          maxLength={200}
          className="min-w-0 flex-1 bg-transparent text-[13.5px] text-white placeholder-faint outline-none"
        />

        <button
          type="submit"
          className="inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-[12.5px] font-medium text-white transition-all duration-300 [transition-timing-function:var(--ease-mairo)] hover:brightness-110"
          style={{ backgroundImage: "var(--mairo-ramp)", boxShadow: "var(--mairo-glow-key)" }}
        >
          Ask Mairo
          <span aria-hidden>→</span>
        </button>
      </div>
    </form>
  );
}
