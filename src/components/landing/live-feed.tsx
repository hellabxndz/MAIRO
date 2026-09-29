"use client";

import { useEffect, useRef, useState } from "react";

// "See Mairo working": an example activity feed. The events arrive one at a
// time once the section is on screen, newest on top, and then stop — a feed
// that loops forever is a distraction, and this one is a demonstration, not a
// window onto anyone's account. It says so in its heading.

type Kind = "budget" | "creative" | "audience" | "platform";

type Event = {
  time: string;
  kind: Kind;
  icon: keyof typeof ICON;
  title: string;
  simple: string;
  advanced: string;
  label: "Reason" | "Recommendation";
  note: string;
};

// Oldest first: they arrive in this order and stack newest-on-top.
const EVENTS: Event[] = [
  {
    time: "8:47 AM",
    kind: "platform",
    icon: "platform",
    title: "Instagram outperforming Facebook",
    simple: "Instagram is getting customers for less than Facebook right now.",
    advanced: "Instagram placements: $26 CPA · Facebook feed: $39 CPA (last 5 days).",
    label: "Recommendation",
    note: "Shift a small portion of today's testing budget toward Instagram.",
  },
  {
    time: "9:31 AM",
    kind: "audience",
    icon: "website",
    title: "Retargeting opportunity found",
    simple: "2,482 people visited your website recently but haven't bought yet.",
    advanced: "2,482 site visitors in the last 30 days with no Purchase event.",
    label: "Recommendation",
    note: "Launch a retargeting campaign.",
  },
  {
    time: "9:54 AM",
    kind: "audience",
    icon: "audience",
    title: "New audience opportunity",
    simple: "Men aged 24–34 are buying more often for the money spent.",
    advanced: "Men 24–34 converting 31% more efficiently than the account average.",
    label: "Recommendation",
    note: "Test an expanded audience.",
  },
  {
    time: "10:18 AM",
    kind: "creative",
    icon: "warning",
    title: "Creative fatigue detected",
    simple: "People are seeing this ad too many times, and fewer are clicking it.",
    advanced: "Creative #2: frequency up to 4.8 while CTR declined 27% over 6 days.",
    label: "Recommendation",
    note: "Create a new variation.",
  },
  {
    time: "10:42 AM",
    kind: "budget",
    icon: "budget",
    title: "Budget optimized",
    simple: "Mairo moved $12/day toward Creative #4, which is getting sales for less.",
    advanced: "Moved $12/day to Creative #4 — cost per purchase 38% below Creative #2 over 5 days.",
    label: "Reason",
    note: "Creative #4 has a 38% lower cost per purchase.",
  },
];

const ICON = {
  budget: { tone: "#818cf8", d: <path d="M5 19v-6M10 19V9M15 19v-9M20 19V5" /> },
  creative: { tone: "#c084fc", d: <path d="M4 5h16v14H4zM4 15l4.5-4.5 4 4 2.5-2.5L20 17" /> },
  audience: { tone: "#38bdf8", d: <path d="M9 8.5a3.2 3.2 0 1 0 0-.01M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5M16 5.8a3 3 0 0 1 0 5.6M18 14.4c1.6.6 2.6 2.2 2.6 4.6" /> },
  website: { tone: "#fbbf24", d: <path d="M3.5 5h17v14h-17zM3.5 9h17M6.5 7h.01M9 7h.01" /> },
  platform: { tone: "#f472b6", d: <path d="M4 6h16v12H4zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM16.5 8.5h.01" /> },
  warning: { tone: "#f59e0b", d: <path d="M12 4 2.8 19.5h18.4zM12 10v4.5M12 17.2v.3" /> },
} as const;

const FILTERS: { key: "all" | Kind; label: string }[] = [
  { key: "all", label: "All activity" },
  { key: "budget", label: "Budget" },
  { key: "creative", label: "Creative" },
  { key: "audience", label: "Audience" },
  { key: "platform", label: "Platforms" },
];

const STEP_MS = 2200;

export function LiveFeed() {
  const [shown, setShown] = useState(0);
  const [filter, setFilter] = useState<"all" | Kind>("all");
  const [advanced, setAdvanced] = useState(false);
  const [run, setRun] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  // Starts when the feed scrolls into view; everything at once for anyone who
  // has asked for less motion.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const t = setTimeout(() => setShown(EVENTS.length), 0);
      return () => clearTimeout(t);
    }
    let timer: ReturnType<typeof setInterval> | undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || timer) return;
        setShown(1);
        timer = setInterval(() => {
          setShown((n) => {
            if (n + 1 >= EVENTS.length && timer) clearInterval(timer);
            return Math.min(EVENTS.length, n + 1);
          });
        }, STEP_MS);
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer) clearInterval(timer);
    };
  }, [run]);

  const visible = EVENTS.slice(0, shown)
    .map((e, i) => ({ e, i }))
    .reverse()
    .filter(({ e }) => filter === "all" || e.kind === filter);
  const newest = shown - 1;

  return (
    <div ref={box} className="rounded-3xl border border-white/[0.08] bg-gradient-to-b from-white/[0.045] to-white/[0.012] p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2.5 text-[14px] font-semibold">
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60 motion-reduce:hidden" />
            <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          Example Mairo Activity
          <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-normal uppercase tracking-[0.14em] text-white/55">Demo</span>
        </p>
        <div className="flex rounded-full border border-white/10 bg-white/[0.03] p-1 text-[13px]" role="group" aria-label="Detail level">
          {(["Simple", "Advanced"] as const).map((m) => {
            const on = (m === "Advanced") === advanced;
            return (
              <button
                key={m}
                type="button"
                aria-pressed={on}
                onClick={() => setAdvanced(m === "Advanced")}
                className={`min-h-[36px] rounded-full px-4 transition ${on ? "bg-gradient-to-r from-[#8b4dfb] to-[#5f2dfd] font-medium text-white" : "text-white/60 hover:text-white"}`}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>

      <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`min-h-[36px] shrink-0 rounded-full border px-3.5 text-[13px] transition ${
              filter === f.key ? "border-violet-400/50 bg-violet-500/15 text-white" : "border-white/10 text-white/60 hover:text-white"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <ol className="mt-5 min-h-[420px] space-y-3">
        {visible.map(({ e, i }) => {
          const icon = ICON[e.icon];
          return (
            <li
              key={`${run}-${i}`}
              className={`lf-in flex gap-4 rounded-2xl border p-4 transition-colors duration-700 ${
                i === newest ? "border-violet-400/30 bg-violet-500/[0.06] shadow-[0_0_40px_-18px_rgba(139,92,246,0.8)]" : "border-white/[0.07] bg-black/20"
              }`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${icon.tone}1f`, color: icon.tone }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
                  {icon.d}
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="text-[15px] font-semibold">{e.title}</p>
                  <p className="text-[12px] tabular-nums text-white/45">{e.time}</p>
                </div>
                <p className="mt-1 text-[14px] leading-relaxed text-white/75">{advanced ? e.advanced : e.simple}</p>
                <p className="mt-1.5 text-[13px] text-white/55">
                  <span className="font-medium text-violet-300">{e.label}:</span> {e.note}
                </p>
              </div>
            </li>
          );
        })}
        {visible.length === 0 && shown > 0 && <li className="py-10 text-center text-[14px] text-white/45">Nothing in this category yet — keep watching.</li>}
      </ol>

      {shown >= EVENTS.length && (
        <button type="button" onClick={() => { setShown(0); setRun((r) => r + 1); }} className="mt-2 text-[13px] text-violet-300 hover:text-white">
          Replay
        </button>
      )}

      <style>{`
        .lf-in { animation: lf-in .6s cubic-bezier(.22,1,.36,1) both; }
        @keyframes lf-in { from { opacity: 0; transform: translateY(-14px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .lf-in { animation: none; } }
      `}</style>
    </div>
  );
}
