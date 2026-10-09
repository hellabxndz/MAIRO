import type { AgentRole } from "@/generated/prisma/enums";
import { AgentIcon } from "@/components/team/agent-ui";

// The hero's picture of the product: your business in the middle, the
// specialties of your AI advertising team around it in the order they work,
// and Budget Guardian as the ring between them and your money. Drawn, not an
// image — it costs one paint and reads the same on a phone. The single
// moving dot respects reduced motion.

const ORBIT: { role: AgentRole; label: string }[] = [
  { role: "STRATEGIST", label: "Strategy" },
  { role: "AUDIENCE", label: "Audience" },
  { role: "CREATIVE", label: "Creative" },
  { role: "ARCHITECT", label: "Campaign" },
  { role: "ANALYST", label: "Analytics" },
  { role: "OPTIMIZER", label: "Optimization" },
  { role: "GROWTH", label: "Growth" },
];

/** Percent from the centre to the outer orbit. */
const R = 39;

export function TeamConstellation() {
  return (
    <figure className="relative mx-auto w-full max-w-[560px]" aria-labelledby="team-figure-caption">
      <div className="relative aspect-square w-full">
        <div aria-hidden className="absolute inset-[8%] rounded-full bg-[radial-gradient(closest-side,rgba(124,92,255,0.12),rgba(124,92,255,0.04)_60%,transparent)]" />
        <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible">
          <defs>
            <linearGradient id="tc-orbit" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="#7c5cff" stopOpacity="0.55" />
              <stop offset="1" stopColor="#3b6bff" stopOpacity="0.35" />
            </linearGradient>
          </defs>
          {/* Spokes: every specialty works for the same business. */}
          {ORBIT.map((_, i) => {
            const a = (-90 + (360 / ORBIT.length) * i) * (Math.PI / 180);
            return <line key={i} x1={50 + 21 * Math.cos(a)} y1={50 + 21 * Math.sin(a)} x2={50 + (R - 5) * Math.cos(a)} y2={50 + (R - 5) * Math.sin(a)} stroke="#7c5cff" strokeOpacity="0.16" strokeWidth="0.25" />;
          })}
          <circle cx="50" cy="50" r={R} fill="none" stroke="url(#tc-orbit)" strokeWidth="0.35" strokeDasharray="0.6 1.4" />
          {/* Budget Guardian: the ring around your money. */}
          <circle cx="50" cy="50" r="19.5" fill="rgba(15,157,107,0.05)" stroke="#0f9d6b" strokeOpacity="0.55" strokeWidth="0.45" />
          <circle cx="50" cy="50" r="17.6" fill="none" stroke="#0f9d6b" strokeOpacity="0.18" strokeWidth="0.25" />
          <g className="mairo-orbit" style={{ transformOrigin: "50px 50px" }}>
            <circle cx="50" cy={50 - R} r="0.9" fill="#7c5cff" />
          </g>
        </svg>

        {/* Your business, inside the Guardian's ring. */}
        <div className="absolute left-1/2 top-1/2 flex w-[30%] -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center">
          <span className="text-[clamp(11px,2.6vw,15px)] font-semibold leading-tight text-white">Your business</span>
          <span className="mt-1 text-[clamp(9.5px,2vw,12px)] leading-tight text-muted">your goals, your money</span>
          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[clamp(9px,1.9vw,11.5px)] font-medium text-amber-200">
            <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M3 8.5l3 3 7-7" />
            </svg>
            You approve
          </span>
        </div>

        {/* Budget Guardian sits on its ring. */}
        <div className="absolute left-1/2 top-[69.5%] flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full bg-paper px-2 py-1 shadow-[0_6px_18px_-8px_rgba(15,157,107,0.6)] ring-1 ring-live/30">
          <AgentIcon role="GUARDIAN" size={22} />
          <span className="whitespace-nowrap pr-1 text-[clamp(9.5px,2vw,12px)] font-semibold text-live">Budget Guardian</span>
        </div>

        {ORBIT.map((n, i) => {
          const a = (-90 + (360 / ORBIT.length) * i) * (Math.PI / 180);
          return (
            <div
              key={n.role}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
              style={{ left: `${50 + R * Math.cos(a)}%`, top: `${50 + R * Math.sin(a)}%` }}
            >
              <span className="rounded-2xl bg-paper p-[3px] shadow-[0_10px_24px_-12px_rgba(91,63,224,0.55)]">
                <AgentIcon role={n.role} size={40} />
              </span>
              <span className="whitespace-nowrap text-[clamp(10px,2.1vw,12.5px)] font-medium text-white">{n.label}</span>
            </div>
          );
        })}
      </div>
      <figcaption id="team-figure-caption" className="mx-auto mt-2 max-w-[460px] text-center text-[12.5px] leading-relaxed text-muted">
        Eight AI specialties of one AI system, built around your business. They check in once a day and when you open MAIRO — and nothing launches, or spends more, without your approval.
      </figcaption>
    </figure>
  );
}
