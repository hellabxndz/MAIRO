// The hero's floating Mairo dashboard: product UI only, every figure a
// labelled sample. No photos, no people.

const NAV = ["Home", "Decisions", "Create", "Campaigns", "Creative Studio", "Analytics", "Reports", "Business Brain", "Mairo Activity", "Integrations"];

const KPIS = [
  { k: "Ad Spend", v: "$1,240", d: "12%" },
  { k: "Revenue", v: "$4,830", d: "19%" },
  { k: "Purchases", v: "38", d: "27%" },
  { k: "ROAS", v: "3.9x", d: "14%" },
];

const HEALTH = [
  { k: "Advertising", v: 88, c: "from-sky-400 to-blue-500" },
  { k: "Creative", v: 72, c: "from-fuchsia-400 to-pink-500" },
  { k: "Website", v: 81, c: "from-fuchsia-400 to-violet-500" },
  { k: "Audience", v: 91, c: "from-emerald-400 to-teal-400" },
  { k: "Budget", v: 79, c: "from-emerald-400 to-lime-400" },
];

const CHART = [22, 30, 26, 38, 34, 44, 40, 52, 47, 60, 56, 70, 66, 82];

function chartPath(values: number[], w: number, h: number) {
  const max = Math.max(...values);
  const step = w / (values.length - 1);
  return values.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (v / max) * h * 0.9).toFixed(1)}`).join(" ");
}

export function HeroDashboard() {
  const line = chartPath(CHART, 300, 90);
  const ring = 2 * Math.PI * 30;
  return (
    <div className="relative rounded-[22px] border border-white/12 bg-[#0a0d1f]/90 p-2.5 shadow-[0_40px_120px_-30px_rgba(99,70,255,0.65),0_0_0_1px_rgba(139,92,246,0.15)] backdrop-blur-xl">
      <div className="flex gap-2.5">
        {/* Sidebar */}
        <aside className="hidden w-[132px] shrink-0 flex-col gap-0.5 rounded-2xl bg-white/[0.02] p-2.5 sm:flex">
          <p className="mb-2 px-1.5 text-[11px] font-light tracking-[0.3em] text-white">MAIRO</p>
          {NAV.map((n, i) => (
            <span
              key={n}
              className={`truncate rounded-lg px-2 py-[5px] text-[9.5px] ${i === 0 ? "bg-gradient-to-r from-[#6d5cff] to-[#8b4dfb] text-white" : "text-white/55"}`}
            >
              {n}
            </span>
          ))}
        </aside>

        <div className="min-w-0 flex-1 space-y-2.5 p-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[12.5px] font-semibold text-white">Good morning</p>
              <p className="text-[9px] text-white/45">Here&rsquo;s what&rsquo;s happening with your ads today.</p>
            </div>
            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-0.5 text-[8.5px]">
              <span className="px-2 py-0.5 text-white/55">Simple</span>
              <span className="rounded-full bg-gradient-to-r from-[#4f7dff] to-[#7c5cff] px-2 py-0.5 text-white">Advanced</span>
              <span className="px-2 py-0.5 text-white/55">Profit First</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {KPIS.map((k) => (
              <div key={k.k} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-2.5">
                <p className="text-[8.5px] text-white/50">{k.k}</p>
                <p className="mt-0.5 text-[15px] font-semibold tabular-nums text-white">{k.v}</p>
                <p className="text-[8.5px] font-medium text-emerald-400">↑ {k.d}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-[1.1fr_1fr]">
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-2.5">
              <p className="text-[8.5px] text-white/50">Revenue</p>
              <p className="text-[13px] font-semibold text-white">$4,830 <span className="text-[8.5px] font-medium text-emerald-400">↑ 19%</span></p>
              <svg viewBox="0 0 300 90" className="mt-1 h-[70px] w-full" preserveAspectRatio="none" aria-hidden>
                <defs>
                  <linearGradient id="hd-fill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" stopColor="#8b5cf6" stopOpacity="0.45" />
                    <stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="hd-line" x1="0" x2="1">
                    <stop offset="0" stopColor="#6d8dff" />
                    <stop offset="1" stopColor="#c084fc" />
                  </linearGradient>
                </defs>
                <path d={`${line} L300,90 L0,90 Z`} fill="url(#hd-fill)" />
                <path d={line} fill="none" stroke="url(#hd-line)" strokeWidth="2.2" />
              </svg>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-2.5">
              <p className="text-[8.5px] text-white/50">Business Health</p>
              <div className="mt-1 flex items-center gap-3">
                <svg viewBox="0 0 72 72" className="h-[58px] w-[58px] shrink-0" aria-label="Business Health 84 out of 100">
                  <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
                  <circle cx="36" cy="36" r="30" fill="none" stroke="url(#hd-line)" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${ring * 0.84} ${ring}`} transform="rotate(-90 36 36)" />
                  <text x="36" y="40" textAnchor="middle" className="fill-white text-[16px] font-semibold">84</text>
                </svg>
                <ul className="min-w-0 flex-1 space-y-1">
                  {HEALTH.map((h) => (
                    <li key={h.k} className="flex items-center gap-1.5 text-[8px] text-white/60">
                      <span className="w-[46px] shrink-0">{h.k}</span>
                      <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                        <span className={`block h-full rounded-full bg-gradient-to-r ${h.c}`} style={{ width: `${h.v}%` }} />
                      </span>
                      <span className="w-3 text-right tabular-nums text-white/80">{h.v}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-[1.1fr_1fr]">
            <div className="rounded-xl border border-violet-400/25 bg-violet-500/[0.07] p-2.5">
              <p className="text-[8.5px] font-semibold uppercase tracking-[0.14em] text-violet-300">Mairo Decision</p>
              <p className="mt-1 text-[11px] font-semibold leading-snug text-white">Move $20/day from Creative #2 to Creative #4.</p>
              <p className="mt-0.5 text-[8.5px] text-white/50">Creative #4 has brought purchases at a lower cost this week.</p>
              <div className="mt-2 flex gap-1.5 text-[8.5px]">
                <span className="rounded-md bg-gradient-to-r from-[#4f7dff] to-[#7c5cff] px-2.5 py-1 text-white">Approve</span>
                <span className="rounded-md border border-white/12 px-2.5 py-1 text-white/75">Ask Why</span>
                <span className="rounded-md border border-white/12 px-2.5 py-1 text-white/75">Ignore</span>
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-2.5">
              <p className="text-[8.5px] text-white/50">Creative Studio</p>
              <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                {["from-violet-500/60 to-fuchsia-500/30", "from-sky-500/60 to-indigo-600/30", "from-fuchsia-500/50 to-rose-500/20", "from-emerald-400/50 to-cyan-500/20"].map((g, i) => (
                  <span key={i} className={`relative aspect-[4/5] overflow-hidden rounded-md bg-gradient-to-br ${g}`}>
                    <span className="absolute inset-x-1 bottom-1 h-1 rounded-full bg-white/40" />
                    <span className="absolute inset-x-1 bottom-2.5 h-1 w-2/3 rounded-full bg-white/25" />
                  </span>
                ))}
              </div>
              <span className="mt-2 inline-block rounded-md border border-white/12 px-2 py-0.5 text-[8.5px] text-white/70">Create More</span>
            </div>
          </div>
        </div>
      </div>
      <span className="absolute left-1/2 top-2.5 -translate-x-1/2 rounded-full border border-white/15 bg-black/50 px-2 py-0.5 text-[8.5px] uppercase tracking-[0.14em] text-white/60">
        Sample data
      </span>
    </div>
  );
}
