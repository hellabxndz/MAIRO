import type { InsightView } from "@/lib/intelligence/run";
import type { OpportunityLevel, RadarReport } from "@/lib/intelligence/types";
import { ConfidenceBadge, FixWithMairo } from "./explain";

// MAIRO OPPORTUNITY RADAR: where to focus next. Six areas rated Low, Medium or
// High from the open Insights in each — a simple shape on a wide screen,
// stacked cards on a phone — and the one or two things most worth doing.
// It never predicts revenue; "potential impact" is how much the finding
// matters, not a dollar figure.

const LEVEL: Record<OpportunityLevel, { n: number; label: string; tone: string }> = {
  LOW: { n: 1, label: "Low opportunity", tone: "text-white/55 bg-white/[0.05]" },
  MEDIUM: { n: 2, label: "Medium opportunity", tone: "text-sky-300 bg-sky-400/10" },
  HIGH: { n: 3, label: "High opportunity", tone: "text-violet-bright bg-violet/20" },
};

function Shape({ areas }: { areas: RadarReport["areas"] }) {
  const size = 240;
  const c = size / 2;
  const R = 84;
  const pt = (i: number, r: number) => {
    const a = (Math.PI * 2 * i) / areas.length - Math.PI / 2;
    return [c + Math.cos(a) * r, c + Math.sin(a) * r] as const;
  };
  const ring = (k: number) => areas.map((_, i) => pt(i, (R * k) / 3).join(",")).join(" ");
  const shape = areas.map((a, i) => pt(i, (R * (a.level ? LEVEL[a.level].n : 0)) / 3).join(",")).join(" ");
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-[240px] w-[240px]" role="img" aria-label="Opportunity by area">
      {[1, 2, 3].map((k) => (
        <polygon key={k} points={ring(k)} fill="none" stroke="rgba(148,166,204,0.14)" />
      ))}
      {areas.map((_, i) => {
        const [x, y] = pt(i, R);
        return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="rgba(148,166,204,0.1)" />;
      })}
      <polygon points={shape} fill="rgba(124,92,255,0.28)" stroke="#a78bfa" strokeWidth="1.8" strokeLinejoin="round" />
      {areas.map((a, i) => {
        const [x, y] = pt(i, R + 20);
        return (
          <text key={a.area} x={x} y={y + 4} textAnchor="middle" className="fill-[#94a6cc] text-[11px]">
            {a.label}
          </text>
        );
      })}
    </svg>
  );
}

function impact(i: InsightView): "High" | "Medium" | "Low" {
  if (i.severity === "URGENT" || i.severity === "ATTENTION") return "High";
  if (i.severity === "OPPORTUNITY") return i.confidence === "HIGH" ? "High" : "Medium";
  return "Low";
}

export function OpportunityCard({ insight, rank }: { insight: InsightView; rank: "Biggest opportunity" | "Next opportunity" }) {
  const area = insight.radarArea ? insight.radarArea[0].toUpperCase() + insight.radarArea.slice(1) : "";
  return (
    <div className={`rounded-xl border p-4 ${rank === "Biggest opportunity" ? "border-violet/35 bg-violet/[0.07]" : "border-white/[0.07] bg-white/[0.02]"}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-bright">{rank}</p>
      <p className="mt-1 text-[16px] font-semibold text-white">{area}</p>
      <p className="mt-1 text-[13.5px] text-white/85">{insight.happened}</p>
      <p className="mt-2 text-[13px] text-muted">
        <span className="text-white/85">Recommended action:</span> {insight.recommendation}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-muted">
        <span>
          Potential impact: <span className="font-medium text-white">{impact(insight)}</span>
        </span>
        <ConfidenceBadge confidence={insight.confidence} compact />
      </div>
      <FixWithMairo insight={insight} label="Review opportunity" className="mt-3" />
    </div>
  );
}

export function OpportunityRadar({ radar, insights }: { radar: RadarReport | null; insights: InsightView[] }) {
  const byKey = new Map(insights.map((i) => [i.dedupeKey, i]));
  const top = (radar?.top ?? []).map((k) => byKey.get(k)).filter((i): i is InsightView => Boolean(i)).slice(0, 2);
  const judged = radar?.areas.some((a) => a.level !== null) ?? false;
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-[#0b1122]/80 p-5">
      <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">Mairo opportunity radar</h2>
      <p className="mt-1 text-[14px] text-muted">Where should you focus next?</p>
      {!radar || !judged ? (
        <p className="mt-4 text-[13.5px] text-muted">Not enough data yet — the radar fills in once a campaign has run for a few days.</p>
      ) : (
        <div className="mt-4 grid gap-5 lg:grid-cols-[auto_1fr]">
          <div className="hidden items-center justify-center lg:flex">
            <Shape areas={radar.areas} />
          </div>
          <div className="space-y-4">
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {radar.areas.map((a) => (
                <li key={a.area} className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
                  <span className="text-[13.5px] text-white">{a.label}</span>
                  {a.level && <span className={`rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em] ${LEVEL[a.level].tone}`}>{LEVEL[a.level].label}</span>}
                </li>
              ))}
            </ul>
            {top.length === 0 ? (
              <p className="text-[13.5px] text-muted">No clear opportunity right now — everything Mairo watches is steady.</p>
            ) : (
              <div className="grid gap-3 xl:grid-cols-2">
                {top.map((i, n) => (
                  <OpportunityCard key={i.id} insight={i} rank={n === 0 ? "Biggest opportunity" : "Next opportunity"} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
