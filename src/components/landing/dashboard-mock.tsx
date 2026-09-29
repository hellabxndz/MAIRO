// A picture of the Mairo dashboard, drawn in markup rather than a screenshot
// so it stays sharp at every size and always matches the product's own look.
//
// The figures are an illustration and the component says so on its face —
// the "Example" tag is part of it, not something a page can forget to add.

const POINTS = [22, 30, 26, 38, 34, 46, 42, 55, 51, 63, 60, 72];

function Sparkline({ className = "", id }: { className?: string; id: string }) {
  const w = 300;
  const h = 90;
  const step = w / (POINTS.length - 1);
  const y = (v: number) => h - (v / 80) * h;
  const line = POINTS.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-line`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#c084fc" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id}-area)`} />
      <path d={line} fill="none" stroke={`url(#${id}-line)`} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      {POINTS.map((v, i) => (
        <circle key={i} cx={i * step} cy={y(v)} r={i === POINTS.length - 1 ? 3.5 : 1.8} fill={i === POINTS.length - 1 ? "#e9d5ff" : "#a78bfa"} />
      ))}
    </svg>
  );
}

const STATS = [
  { k: "Ad spend", v: "$1,248", d: "+12%" },
  { k: "Purchases", v: "38", d: "+27%" },
  { k: "Revenue", v: "$4,832", d: "+34%" },
  { k: "ROAS", v: "3.8x", d: "+31%" },
];

const ADS = [
  { tone: "from-[#1e1b4b] to-[#4c1d95]", label: "Creative #1", cpa: "$32.84" },
  { tone: "from-[#172554] to-[#1e40af]", label: "Creative #2", cpa: "$41.23" },
  { tone: "from-[#3b0764] to-[#86198f]", label: "Creative #3", cpa: "$55.10" },
  { tone: "from-[#0c4a6e] to-[#6d28d9]", label: "Creative #4", cpa: "$38.77" },
];

const NAV = ["Home", "Decisions", "Campaigns", "Creative Studio", "Business Brain", "Mairo AI"];

// `id` keeps the chart's gradients apart when the page draws the mock twice.
export function DashboardMock({ compact = false, id = "dm" }: { compact?: boolean; id?: string }) {
  return (
    <div className="relative flex h-full w-full overflow-hidden rounded-[inherit] bg-[#070712] text-left text-white">
      <aside className={`${compact ? "hidden sm:flex" : "flex"} w-[22%] min-w-[92px] flex-col gap-1 border-r border-white/[0.06] p-3`}>
        <p className="mb-2 text-[11px] font-semibold tracking-tight">Mairo</p>
        {NAV.map((n, i) => (
          <span
            key={n}
            className={`truncate rounded-md px-2 py-1 text-[8.5px] ${i === 0 ? "bg-violet-500/20 text-violet-100" : "text-white/45"}`}
          >
            {n}
          </span>
        ))}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-3.5">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-semibold">Overview</p>
          <span className="rounded border border-white/10 px-1.5 py-0.5 text-[7.5px] text-white/50">Last 7 days</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {STATS.map((s) => (
            <div key={s.k} className="rounded-md border border-white/[0.07] bg-white/[0.03] p-1.5">
              <p className="text-[7px] text-white/45">{s.k}</p>
              <p className="text-[11px] font-semibold tabular-nums">{s.v}</p>
              <p className="text-[6.5px] text-emerald-400">↑ {s.d}</p>
            </div>
          ))}
        </div>
        <div className="relative rounded-md border border-white/[0.07] bg-white/[0.02] p-2">
          <Sparkline id={id} className="h-[70px] w-full" />
        </div>
        <div>
          <p className="mb-1 text-[8px] text-white/55">Recent ads</p>
          <div className="grid grid-cols-4 gap-1.5">
            {ADS.map((a) => (
              <div key={a.label} className="overflow-hidden rounded-md border border-white/[0.07]">
                <div className={`h-9 bg-gradient-to-br ${a.tone}`} />
                <p className="px-1 pt-0.5 text-[7px] font-semibold tabular-nums">{a.cpa} CPA</p>
                <p className="px-1 pb-1 text-[6.5px] text-white/45">{a.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <span className="absolute bottom-2 right-2 rounded-full border border-white/15 bg-black/60 px-2 py-0.5 text-[7.5px] uppercase tracking-[0.12em] text-white/60">
        Example
      </span>
    </div>
  );
}

/** The same dashboard, inside a laptop, tilted slightly away. */
export function LaptopMock() {
  return (
    <div className="relative mx-auto w-full max-w-[640px] [perspective:1800px]">
      <div className="origin-bottom [transform:rotateX(6deg)_rotateY(-10deg)]">
        <div className="rounded-[14px] border border-white/15 bg-[#0b0b14] p-[7px] shadow-[0_40px_120px_-20px_rgba(124,92,255,0.45)]">
          <div className="aspect-[16/10] rounded-[9px]">
            <DashboardMock id="dm-laptop" />
          </div>
        </div>
        <div className="mx-auto h-3 w-[108%] -translate-x-[3.7%] rounded-b-[18px] bg-gradient-to-b from-[#2a2a36] to-[#0e0e16] shadow-[0_20px_40px_rgba(0,0,0,0.6)]" />
      </div>
    </div>
  );
}
